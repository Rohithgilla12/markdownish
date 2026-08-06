import { describe, expect, it, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@tauri-apps/api/core", async () => {
  const { invokeMock } = await import("@/test-utils/tauri-mocks");
  return { invoke: invokeMock };
});

import { LiveGrep } from "./LiveGrep";
import type { FileMatches, SearchMatch, SearchResult } from "@/hooks/useFolderSearch";
import { resetTauriMocks, setInvokeHandler } from "@/test-utils/tauri-mocks";

beforeEach(() => {
  resetTauriMocks();
  localStorage.clear();
});

function makeMatch(overrides: Partial<SearchMatch> = {}): SearchMatch {
  return {
    line: 1,
    col: 1,
    offset: 0,
    length: 3,
    snippet: "abc FOO def",
    snippetMatchStart: 4,
    snippetMatchEnd: 7,
    ...overrides,
  };
}

function makeFile(overrides: Partial<FileMatches> = {}): FileMatches {
  return {
    path: "/proj/spec.md",
    mtime: 1,
    matches: [],
    truncated: false,
    ...overrides,
  };
}

function makeResult(overrides: Partial<SearchResult> = {}): SearchResult {
  return {
    files: [],
    truncatedFiles: false,
    requestId: 0,
    cancelled: false,
    ...overrides,
  };
}

describe("LiveGrep", () => {
  it("renders the idle empty state initially", () => {
    setInvokeHandler("search_folder", () => makeResult());
    render(<LiveGrep folder="/proj" onSelect={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText("Type to grep this folder.")).toBeInTheDocument();
  });

  it("greps live and renders flat match rows with highlight", async () => {
    const user = userEvent.setup();
    setInvokeHandler("search_folder", (args) =>
      makeResult({
        files: [
          makeFile({
            path: "/proj/notes/spec.md",
            matches: [makeMatch({ line: 12, offset: 5, length: 3 })],
          }),
        ],
        requestId: args.requestId as number,
      }),
    );

    const { container } = render(
      <LiveGrep folder="/proj" onSelect={vi.fn()} onClose={vi.fn()} />,
    );

    await user.type(screen.getByPlaceholderText("Search in files…"), "foo");

    await waitFor(() => expect(screen.getByText("notes/spec.md")).toBeInTheDocument());
    expect(screen.getByText(":12")).toBeInTheDocument();

    const mark = container.querySelector("mark");
    expect(mark).not.toBeNull();
    expect(mark!.textContent).toBe("FOO");
  });

  it("Enter selects the row under the cursor; arrows move it", async () => {
    const user = userEvent.setup();
    setInvokeHandler("search_folder", (args) =>
      makeResult({
        files: [
          makeFile({
            matches: [
              makeMatch({ line: 1, offset: 5, length: 3 }),
              makeMatch({ line: 9, offset: 40, length: 3 }),
            ],
          }),
        ],
        requestId: args.requestId as number,
      }),
    );

    const onSelect = vi.fn();
    render(<LiveGrep folder="/proj" onSelect={onSelect} onClose={vi.fn()} />);

    const input = screen.getByPlaceholderText("Search in files…");
    await user.type(input, "foo");
    await waitFor(() => expect(screen.getByText(":9")).toBeInTheDocument());

    await user.keyboard("{ArrowDown}{Enter}");
    expect(onSelect).toHaveBeenCalledWith("/proj/spec.md", 40, 3);
  });

  it("clicking a row selects it", async () => {
    const user = userEvent.setup();
    setInvokeHandler("search_folder", (args) =>
      makeResult({
        files: [
          makeFile({ matches: [makeMatch({ line: 3, offset: 7, length: 3 })] }),
        ],
        requestId: args.requestId as number,
      }),
    );

    const onSelect = vi.fn();
    render(<LiveGrep folder="/proj" onSelect={onSelect} onClose={vi.fn()} />);

    await user.type(screen.getByPlaceholderText("Search in files…"), "foo");
    await waitFor(() => expect(screen.getByText(":3")).toBeInTheDocument());

    const row = screen.getByText(":3").closest("button");
    expect(row).not.toBeNull();
    await user.click(row!);
    expect(onSelect).toHaveBeenCalledWith("/proj/spec.md", 7, 3);
  });

  it("Escape calls onClose", async () => {
    const user = userEvent.setup();
    setInvokeHandler("search_folder", () => makeResult());
    const onClose = vi.fn();
    render(<LiveGrep folder="/proj" onSelect={vi.fn()} onClose={onClose} />);

    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
