import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { renderHook } from "@testing-library/react";

vi.mock("@tauri-apps/api/core", async () => {
  const { invokeMock } = await import("@/test-utils/tauri-mocks");
  return { invoke: invokeMock };
});
vi.mock("@tauri-apps/plugin-fs", async () => {
  const actual = await vi.importActual<object>("@tauri-apps/plugin-fs");
  const { watchImmediateMock } = await import("@/test-utils/tauri-mocks");
  return { ...actual, watchImmediate: watchImmediateMock };
});

import { useFolderWatcher, type WatcherEvent } from "./useFolderWatcher";
import {
  emitWatcherEvent,
  invokeMock,
  isWatcherActive,
  resetTauriMocks,
  setInvokeHandler,
  watchImmediateMock,
} from "@/test-utils/tauri-mocks";

beforeEach(() => {
  resetTauriMocks();
  // The hook widens the fs plugin scope before starting the watch.
  setInvokeHandler("allow_folder", () => null);
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

async function flushWatcherStart() {
  // The hook starts the watcher inside an async IIFE within useEffect, and
  // awaits `allow_folder` before `watchImmediate`. Run real microtasks so both
  // promises resolve and currentWatchCallback gets assigned in the mock module.
  vi.useRealTimers();
  for (let i = 0; i < 6; i++) await Promise.resolve();
  vi.useFakeTimers();
}

describe("useFolderWatcher", () => {
  it("registers a recursive watch on mount and unsubscribes on unmount", async () => {
    const onEvent = vi.fn<(ev: WatcherEvent) => void>();
    const { unmount } = renderHook(() => useFolderWatcher("/proj", onEvent));
    await flushWatcherStart();

    // Scope must be widened first, or the plugin rejects `watch` outright.
    expect(invokeMock).toHaveBeenCalledWith("allow_folder", { path: "/proj" });

    expect(watchImmediateMock).toHaveBeenCalledTimes(1);
    const [path, cb, opts] = watchImmediateMock.mock.calls[0];
    expect(path).toBe("/proj");
    expect(typeof cb).toBe("function");
    expect(opts).toEqual({ recursive: true });
    expect(isWatcherActive()).toBe(true);

    unmount();
    expect(isWatcherActive()).toBe(false);
  });

  it("filters out events whose paths do not end in .md / .mdx / .markdown", async () => {
    const onEvent = vi.fn<(ev: WatcherEvent) => void>();
    setInvokeHandler("stat_mtime", () => 1);
    setInvokeHandler("is_self_write", () => false);
    renderHook(() => useFolderWatcher("/proj", onEvent));
    await flushWatcherStart();

    emitWatcherEvent({
      type: { modify: { kind: "any" } },
      paths: ["/proj/x.txt", "/proj/README"],
    });

    await vi.advanceTimersByTimeAsync(250);
    expect(onEvent).not.toHaveBeenCalled();
  });

  it("filters out events under node_modules / dotfile dirs", async () => {
    const onEvent = vi.fn<(ev: WatcherEvent) => void>();
    setInvokeHandler("stat_mtime", () => 1);
    setInvokeHandler("is_self_write", () => false);
    renderHook(() => useFolderWatcher("/proj", onEvent));
    await flushWatcherStart();

    emitWatcherEvent({
      type: { modify: { kind: "any" } },
      paths: ["/proj/node_modules/pkg/x.md", "/proj/.cache/y.md"],
    });

    await vi.advanceTimersByTimeAsync(250);
    expect(onEvent).not.toHaveBeenCalled();
  });

  it("debounces same-path events to one emission per 200ms", async () => {
    const onEvent = vi.fn<(ev: WatcherEvent) => void>();
    setInvokeHandler("stat_mtime", () => 7);
    setInvokeHandler("is_self_write", () => false);
    renderHook(() => useFolderWatcher("/proj", onEvent));
    await flushWatcherStart();

    emitWatcherEvent({ type: { modify: { kind: "any" } }, paths: ["/proj/a.md"] });
    emitWatcherEvent({ type: { modify: { kind: "any" } }, paths: ["/proj/a.md"] });
    emitWatcherEvent({ type: { modify: { kind: "any" } }, paths: ["/proj/a.md"] });

    await vi.advanceTimersByTimeAsync(250);
    // Let the async invoke chain settle.
    await vi.runAllTimersAsync();
    expect(onEvent).toHaveBeenCalledTimes(1);
  });

  it("drops events recognised as self-writes via is_self_write", async () => {
    const onEvent = vi.fn<(ev: WatcherEvent) => void>();
    setInvokeHandler("stat_mtime", () => 42);
    setInvokeHandler("is_self_write", () => true);
    renderHook(() => useFolderWatcher("/proj", onEvent));
    await flushWatcherStart();

    emitWatcherEvent({ type: { modify: { kind: "any" } }, paths: ["/proj/a.md"] });

    await vi.advanceTimersByTimeAsync(250);
    await vi.runAllTimersAsync();
    expect(onEvent).not.toHaveBeenCalled();
  });

  it("passes external modify events through to onEvent", async () => {
    const onEvent = vi.fn<(ev: WatcherEvent) => void>();
    setInvokeHandler("stat_mtime", () => 42);
    setInvokeHandler("is_self_write", () => false);
    renderHook(() => useFolderWatcher("/proj", onEvent));
    await flushWatcherStart();

    emitWatcherEvent({ type: { modify: { kind: "any" } }, paths: ["/proj/a.md"] });

    await vi.advanceTimersByTimeAsync(250);
    await vi.runAllTimersAsync();

    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent).toHaveBeenCalledWith({
      kind: "modify",
      path: "/proj/a.md",
      mtime: 42,
    });
  });

  it("remove events skip stat and pass through immediately after debounce", async () => {
    const onEvent = vi.fn<(ev: WatcherEvent) => void>();
    // Deliberately no stat_mtime handler — remove must not invoke it.
    renderHook(() => useFolderWatcher("/proj", onEvent));
    await flushWatcherStart();

    emitWatcherEvent({ type: { remove: {} }, paths: ["/proj/a.md"] });

    await vi.advanceTimersByTimeAsync(250);
    expect(onEvent).toHaveBeenCalledWith({ kind: "remove", path: "/proj/a.md" });
    // A removal also changed the shape of the tree.
    expect(onEvent).toHaveBeenCalledWith({ kind: "tree" });
    expect(onEvent).toHaveBeenCalledTimes(2);
  });

  it("treats stat_mtime errors as remove", async () => {
    const onEvent = vi.fn<(ev: WatcherEvent) => void>();
    setInvokeHandler("stat_mtime", () => {
      throw new Error("ENOENT");
    });
    setInvokeHandler("is_self_write", () => false);
    renderHook(() => useFolderWatcher("/proj", onEvent));
    await flushWatcherStart();

    emitWatcherEvent({ type: { modify: { kind: "any" } }, paths: ["/proj/a.md"] });

    await vi.advanceTimersByTimeAsync(250);
    await vi.runAllTimersAsync();
    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent).toHaveBeenCalledWith({ kind: "remove", path: "/proj/a.md" });
  });


  it("emits a single coalesced tree event for a burst of structural changes", async () => {
    const onEvent = vi.fn<(ev: WatcherEvent) => void>();
    setInvokeHandler("stat_mtime", () => 1);
    setInvokeHandler("is_self_write", () => false);
    renderHook(() => useFolderWatcher("/proj", onEvent));
    await flushWatcherStart();

    // A `git checkout` shape: many files at once, only some of them markdown.
    emitWatcherEvent({
      type: { create: { kind: "file" } },
      paths: ["/proj/docs", "/proj/a.txt", "/proj/b.md"],
    });
    emitWatcherEvent({ type: { create: { kind: "file" } }, paths: ["/proj/c.md"] });

    await vi.advanceTimersByTimeAsync(300);
    await vi.runAllTimersAsync();

    const treeEvents = onEvent.mock.calls.filter((c) => c[0].kind === "tree");
    expect(treeEvents).toHaveLength(1);
  });

  it("emits a tree event for a directory create, even with no markdown path", async () => {
    const onEvent = vi.fn<(ev: WatcherEvent) => void>();
    renderHook(() => useFolderWatcher("/proj", onEvent));
    await flushWatcherStart();

    emitWatcherEvent({ type: { create: { kind: "folder" } }, paths: ["/proj/notes"] });

    await vi.advanceTimersByTimeAsync(300);
    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent).toHaveBeenCalledWith({ kind: "tree" });
  });

  it("emits a tree event for a rename but not for a content modify", async () => {
    const onEvent = vi.fn<(ev: WatcherEvent) => void>();
    setInvokeHandler("stat_mtime", () => 3);
    setInvokeHandler("is_self_write", () => false);
    renderHook(() => useFolderWatcher("/proj", onEvent));
    await flushWatcherStart();

    emitWatcherEvent({ type: { modify: { kind: "data" } }, paths: ["/proj/a.md"] });
    await vi.advanceTimersByTimeAsync(300);
    await vi.runAllTimersAsync();
    expect(onEvent.mock.calls.filter((c) => c[0].kind === "tree")).toHaveLength(0);

    onEvent.mockClear();
    emitWatcherEvent({ type: { modify: { kind: "rename" } }, paths: ["/proj/b.md"] });
    await vi.advanceTimersByTimeAsync(300);
    await vi.runAllTimersAsync();
    expect(onEvent.mock.calls.filter((c) => c[0].kind === "tree")).toHaveLength(1);
  });

  it("watches folders nested under a hidden ancestor", async () => {
    // Regression: the hidden-segment filter used to run over the whole
    // absolute path, so opening anything under ~/.claude dropped every event.
    const onEvent = vi.fn<(ev: WatcherEvent) => void>();
    setInvokeHandler("stat_mtime", () => 9);
    setInvokeHandler("is_self_write", () => false);
    renderHook(() => useFolderWatcher("/Users/me/.claude/skills", onEvent));
    await flushWatcherStart();

    emitWatcherEvent({
      type: { modify: { kind: "data" } },
      paths: ["/Users/me/.claude/skills/SKILL.md"],
    });

    await vi.advanceTimersByTimeAsync(300);
    await vi.runAllTimersAsync();
    expect(onEvent).toHaveBeenCalledWith({
      kind: "modify",
      path: "/Users/me/.claude/skills/SKILL.md",
      mtime: 9,
    });
  });

  it("ignores paths outside the watched root", async () => {
    const onEvent = vi.fn<(ev: WatcherEvent) => void>();
    setInvokeHandler("stat_mtime", () => 1);
    setInvokeHandler("is_self_write", () => false);
    renderHook(() => useFolderWatcher("/proj", onEvent));
    await flushWatcherStart();

    emitWatcherEvent({
      type: { create: { kind: "file" } },
      paths: ["/other/a.md", "/projector/b.md", "/proj"],
    });

    await vi.advanceTimersByTimeAsync(300);
    await vi.runAllTimersAsync();
    expect(onEvent).not.toHaveBeenCalled();
  });

  it("warns at most once when classify returns null on a non-empty paths event", async () => {
    const onEvent = vi.fn<(ev: WatcherEvent) => void>();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    renderHook(() => useFolderWatcher("/proj", onEvent));
    await flushWatcherStart();

    emitWatcherEvent({
      type: "unknown-shape" as unknown,
      paths: ["/proj/a.md"],
    });
    await vi.advanceTimersByTimeAsync(250);

    // Module-level guard: a second unknown event MUST NOT warn again.
    emitWatcherEvent({
      type: "still-weird" as unknown,
      paths: ["/proj/b.md"],
    });
    await vi.advanceTimersByTimeAsync(250);

    expect(onEvent).not.toHaveBeenCalled();
    // Count only our own warning, not any incidental React warnings.
    const ourWarns = warnSpy.mock.calls.filter(
      (c) => typeof c[0] === "string" && c[0].includes("useFolderWatcher"),
    );
    expect(ourWarns).toHaveLength(1);

    warnSpy.mockRestore();
  });
});
