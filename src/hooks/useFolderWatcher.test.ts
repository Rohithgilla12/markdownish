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
  isWatcherActive,
  resetTauriMocks,
  setInvokeHandler,
  watchImmediateMock,
} from "@/test-utils/tauri-mocks";

beforeEach(() => {
  resetTauriMocks();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

async function flushWatcherStart() {
  // The hook starts the watcher inside an async IIFE within useEffect.
  // Run real microtasks once so watchImmediate's promise resolves and
  // currentWatchCallback gets assigned in the mock module.
  vi.useRealTimers();
  await Promise.resolve();
  await Promise.resolve();
  vi.useFakeTimers();
}

describe("useFolderWatcher", () => {
  it("registers a recursive watch on mount and unsubscribes on unmount", async () => {
    const onEvent = vi.fn<(ev: WatcherEvent) => void>();
    const { unmount } = renderHook(() => useFolderWatcher("/proj", onEvent));
    await flushWatcherStart();

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
    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent).toHaveBeenCalledWith({ kind: "remove", path: "/proj/a.md" });
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
