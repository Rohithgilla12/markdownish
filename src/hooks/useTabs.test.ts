import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

vi.mock("@tauri-apps/api/core", async () => {
  const { invokeMock } = await import("@/test-utils/tauri-mocks");
  return { invoke: invokeMock };
});

import { useTabs } from "./useTabs";
import {
  invokeMock,
  resetTauriMocks,
  setInvokeHandler,
} from "@/test-utils/tauri-mocks";

beforeEach(() => {
  resetTauriMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useTabs", () => {
  it("openFile loads content and exposes activeTab", async () => {
    setInvokeHandler("read_text_file", () => ({ content: "hello", mtime: 1 }));

    const { result } = renderHook(() => useTabs());

    await act(async () => {
      await result.current.openFile("/a.md");
    });

    expect(result.current.activeTab).toBeDefined();
    expect(result.current.activeTab!.content).toBe("hello");
    expect(result.current.activeTab!.mtime).toBe(1);
    expect(result.current.activeTab!.deleted).toBe(false);
  });

  it("applyExternalEvent modify + clean tab → silent reload", async () => {
    setInvokeHandler("read_text_file", () => ({ content: "hello", mtime: 1 }));
    const { result } = renderHook(() => useTabs());
    await act(async () => {
      await result.current.openFile("/a.md");
    });

    setInvokeHandler("read_text_file", () => ({ content: "world", mtime: 2 }));

    await act(async () => {
      await result.current.applyExternalEvent({
        kind: "modify",
        path: "/a.md",
        mtime: 2,
      });
    });

    const tab = result.current.activeTab!;
    expect(tab.content).toBe("world");
    expect(tab.original).toBe("world");
    expect(tab.mtime).toBe(2);
    expect(tab.conflict).toBeNull();
  });

  it("applyExternalEvent modify + dirty tab → conflict toast", async () => {
    setInvokeHandler("read_text_file", () => ({ content: "hello", mtime: 1 }));
    const { result } = renderHook(() => useTabs());
    await act(async () => {
      await result.current.openFile("/a.md");
    });

    act(() => {
      result.current.setActiveContent("hello+edit");
    });

    setInvokeHandler("read_text_file", () => ({ content: "world", mtime: 2 }));

    await act(async () => {
      await result.current.applyExternalEvent({
        kind: "modify",
        path: "/a.md",
        mtime: 2,
      });
    });

    const tab = result.current.activeTab!;
    expect(tab.conflict).not.toBeNull();
    expect(tab.conflict!.newContent).toBe("world");
    expect(tab.content).toBe("hello+edit");
  });

  it("applyExternalEvent remove + clean tab → tab is closed", async () => {
    setInvokeHandler("read_text_file", () => ({ content: "hello", mtime: 1 }));
    const { result } = renderHook(() => useTabs());
    await act(async () => {
      await result.current.openFile("/a.md");
    });

    await act(async () => {
      await result.current.applyExternalEvent({ kind: "remove", path: "/a.md" });
    });

    expect(result.current.tabs).toHaveLength(0);
    expect(result.current.activeTab).toBeUndefined();
  });

  it("applyExternalEvent remove + dirty tab → tab.deleted = true", async () => {
    setInvokeHandler("read_text_file", () => ({ content: "hello", mtime: 1 }));
    const { result } = renderHook(() => useTabs());
    await act(async () => {
      await result.current.openFile("/a.md");
    });
    act(() => {
      result.current.setActiveContent("hello+edit");
    });

    await act(async () => {
      await result.current.applyExternalEvent({ kind: "remove", path: "/a.md" });
    });

    expect(result.current.tabs).toHaveLength(1);
    expect(result.current.tabs[0].deleted).toBe(true);
    expect(result.current.tabs[0].content).toBe("hello+edit");
  });

  it("resurrectDeleted recreates the file and clears deleted flag", async () => {
    setInvokeHandler("read_text_file", () => ({ content: "hello", mtime: 1 }));
    setInvokeHandler("create_text_file", () => 99);

    const { result } = renderHook(() => useTabs());
    await act(async () => {
      await result.current.openFile("/a.md");
    });
    act(() => {
      result.current.setActiveContent("hello+edit");
    });
    await act(async () => {
      await result.current.applyExternalEvent({ kind: "remove", path: "/a.md" });
    });

    await act(async () => {
      await result.current.resurrectDeleted("/a.md");
    });

    const tab = result.current.tabs[0];
    expect(tab.deleted).toBe(false);
    expect(tab.original).toBe(tab.content);
    expect(tab.mtime).toBe(99);
  });

  it("saveActive clears deleted flag and writes", async () => {
    setInvokeHandler("read_text_file", () => ({ content: "hello", mtime: 1 }));
    setInvokeHandler("write_text_file", () => 50);

    const { result } = renderHook(() => useTabs());
    await act(async () => {
      await result.current.openFile("/a.md");
    });
    act(() => {
      result.current.setActiveContent("hello+edit");
    });
    await act(async () => {
      await result.current.applyExternalEvent({ kind: "remove", path: "/a.md" });
    });

    expect(result.current.tabs[0].deleted).toBe(true);

    await act(async () => {
      await result.current.saveActive();
    });

    const tab = result.current.tabs[0];
    expect(tab.deleted).toBe(false);
    expect(tab.mtime).toBe(50);
    expect(tab.original).toBe("hello+edit");
  });

  it("autosave is suppressed while deleted is true", async () => {
    vi.useFakeTimers();
    setInvokeHandler("read_text_file", () => ({ content: "hello", mtime: 1 }));
    let writes = 0;
    setInvokeHandler("write_text_file", () => {
      writes += 1;
      return 2;
    });

    const { result } = renderHook(() => useTabs());
    await act(async () => {
      await result.current.openFile("/a.md");
    });
    act(() => {
      result.current.setActiveContent("hello+edit");
    });
    await act(async () => {
      await result.current.applyExternalEvent({ kind: "remove", path: "/a.md" });
    });

    expect(result.current.tabs[0].deleted).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(writes).toBe(0);
  });

  it("autosave DOES fire after 2s on a normal dirty tab", async () => {
    vi.useFakeTimers();
    setInvokeHandler("read_text_file", () => ({ content: "hello", mtime: 1 }));
    let writes = 0;
    setInvokeHandler("write_text_file", () => {
      writes += 1;
      return 2;
    });

    const { result } = renderHook(() => useTabs());
    await act(async () => {
      await result.current.openFile("/a.md");
    });
    act(() => {
      result.current.setActiveContent("hello+edit");
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2100);
      // Allow the async invoke chain to settle.
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(writes).toBe(1);
    // Sanity check we actually went through the mocked invoke.
    expect(invokeMock).toHaveBeenCalledWith(
      "write_text_file",
      expect.objectContaining({ path: "/a.md", contents: "hello+edit" }),
    );
  });
});
