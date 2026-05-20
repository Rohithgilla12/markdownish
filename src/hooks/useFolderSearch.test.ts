import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

vi.mock("@tauri-apps/api/core", async () => {
  const { invokeMock } = await import("@/test-utils/tauri-mocks");
  return { invoke: invokeMock };
});

import {
  useFolderSearch,
  type FileEdit,
  type ReplaceOutcome,
  type SearchResult,
} from "./useFolderSearch";
import {
  invokeMock,
  resetTauriMocks,
  setInvokeHandler,
} from "@/test-utils/tauri-mocks";

beforeEach(() => {
  resetTauriMocks();
  localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

function buildResult(requestId: number): SearchResult {
  return {
    files: [
      {
        path: `/a.md`,
        mtime: 1,
        matches: [],
        truncated: false,
      },
    ],
    truncatedFiles: false,
    requestId,
    cancelled: false,
  };
}

describe("useFolderSearch", () => {
  it("stays idle when folder is null or query is empty", async () => {
    const { result, rerender } = renderHook(
      ({ folder }: { folder: string | null }) => useFolderSearch(folder),
      { initialProps: { folder: null as string | null } },
    );
    expect(result.current.state).toEqual({ status: "idle" });

    rerender({ folder: "/proj" });
    expect(result.current.state).toEqual({ status: "idle" });
    // Setting empty query keeps idle.
    act(() => {
      result.current.setQuery("");
    });
    expect(result.current.state).toEqual({ status: "idle" });
  });

  it("runs a search after the 150ms debounce and exposes the result", async () => {
    vi.useFakeTimers();
    setInvokeHandler("search_folder", (args) => {
      return buildResult(args.requestId as number);
    });

    const { result } = renderHook(() => useFolderSearch("/proj"));

    act(() => {
      result.current.setQuery("foo");
    });

    expect(result.current.state.status).toBe("loading");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });

    expect(result.current.state.status).toBe("ready");
    if (result.current.state.status === "ready") {
      expect(result.current.state.query).toBe("foo");
      expect(result.current.state.result.files).toHaveLength(1);
    }
  });

  it("each query change increments requestId monotonically", async () => {
    vi.useFakeTimers();
    const seenIds: number[] = [];
    setInvokeHandler("search_folder", (args) => {
      seenIds.push(args.requestId as number);
      return buildResult(args.requestId as number);
    });

    const { result } = renderHook(() => useFolderSearch("/proj"));

    act(() => {
      result.current.setQuery("a");
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });

    act(() => {
      result.current.setQuery("b");
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });

    expect(seenIds.length).toBeGreaterThanOrEqual(2);
    expect(seenIds[seenIds.length - 1]).toBeGreaterThan(seenIds[0]);
  });

  it("drops stale responses (later request supersedes earlier)", async () => {
    vi.useFakeTimers();

    let resolveA: ((value: SearchResult) => void) | null = null;
    const deferredA = new Promise<SearchResult>((resolve) => {
      resolveA = resolve;
    });

    setInvokeHandler("search_folder", (args) => {
      const id = args.requestId as number;
      const q = args.query as string;
      if (q === "a") {
        return deferredA;
      }
      return buildResult(id);
    });

    const { result } = renderHook(() => useFolderSearch("/proj"));

    act(() => {
      result.current.setQuery("a");
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    // First request is in-flight (still loading).
    expect(result.current.state.status).toBe("loading");

    act(() => {
      result.current.setQuery("b");
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    // A few microtask flushes for the resolved promise to settle.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.state.status).toBe("ready");
    if (result.current.state.status === "ready") {
      expect(result.current.state.query).toBe("b");
    }

    // Now resolve the stale first request — must NOT clobber state.
    await act(async () => {
      resolveA!(buildResult(1));
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.state.status).toBe("ready");
    if (result.current.state.status === "ready") {
      expect(result.current.state.query).toBe("b");
    }
  });

  it("replace() invokes replace_in_files with the given edits", async () => {
    const outcomes: ReplaceOutcome[] = [
      { kind: "ok", path: "/a.md", newMtime: 2, replaced: 1 },
    ];
    setInvokeHandler("replace_in_files", (args) => {
      expect(args.edits).toEqual([
        {
          path: "/a.md",
          expectedMtime: 1,
          replacements: [{ offset: 0, length: 3, text: "BAR" }],
        },
      ]);
      return outcomes;
    });

    const { result } = renderHook(() => useFolderSearch("/proj"));

    const edits: FileEdit[] = [
      {
        path: "/a.md",
        expectedMtime: 1,
        replacements: [{ offset: 0, length: 3, text: "BAR" }],
      },
    ];

    let returned: ReplaceOutcome[] = [];
    await act(async () => {
      returned = await result.current.replace(edits);
    });
    expect(returned).toEqual(outcomes);
    // Confirm we actually hit invoke for replace_in_files.
    expect(invokeMock).toHaveBeenCalledWith(
      "replace_in_files",
      expect.objectContaining({ edits }),
    );
  });
});
