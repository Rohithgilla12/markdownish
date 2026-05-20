import { describe, expect, it, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@tauri-apps/api/core", async () => {
  const { invokeMock } = await import("@/test-utils/tauri-mocks");
  return { invoke: invokeMock };
});

import { FindReplacePanel } from "./FindReplacePanel";
import type {
  FileEdit,
  FileMatches,
  ReplaceOutcome,
  SearchMatch,
  SearchResult,
} from "@/hooks/useFolderSearch";
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

describe("FindReplacePanel", () => {
  it("renders the idle empty state initially", () => {
    setInvokeHandler("search_folder", () => makeResult());
    render(
      <FindReplacePanel
        folder="/proj"
        onSelectMatch={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText("Type to search this folder.")).toBeInTheDocument();
  });

  it("runs a search and renders results after debounce", async () => {
    const user = userEvent.setup();
    setInvokeHandler("search_folder", (args) =>
      makeResult({
        files: [
          makeFile({
            matches: [
              makeMatch({
                line: 12,
                col: 1,
                offset: 5,
                length: 3,
              }),
            ],
          }),
        ],
        requestId: args.requestId as number,
      }),
    );

    const { container } = render(
      <FindReplacePanel
        folder="/proj"
        onSelectMatch={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    await user.type(screen.getByPlaceholderText("Find in folder…"), "foo");

    await waitFor(() => expect(screen.getByText("12")).toBeInTheDocument());
    // basename "spec.md" + the relativised path also rendering as "spec.md".
    expect(screen.getAllByText("spec.md").length).toBeGreaterThanOrEqual(1);

    const mark = container.querySelector("mark");
    expect(mark).not.toBeNull();
    expect(mark!.textContent).toBe("FOO");
  });

  it("clicking a match row calls onSelectMatch and onClose", async () => {
    const user = userEvent.setup();
    setInvokeHandler("search_folder", (args) =>
      makeResult({
        files: [
          makeFile({
            matches: [makeMatch({ line: 12, offset: 5, length: 3 })],
          }),
        ],
        requestId: args.requestId as number,
      }),
    );

    const onSelectMatch = vi.fn();
    const onClose = vi.fn();
    render(
      <FindReplacePanel
        folder="/proj"
        onSelectMatch={onSelectMatch}
        onClose={onClose}
      />,
    );

    await user.type(screen.getByPlaceholderText("Find in folder…"), "foo");
    await waitFor(() => expect(screen.getByText("12")).toBeInTheDocument());

    const rowButton = screen.getByText("12").closest("button");
    expect(rowButton).not.toBeNull();
    await user.click(rowButton!);

    expect(onSelectMatch).toHaveBeenCalledWith("/proj/spec.md", 5, 3);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("Replace all sends edits sorted by descending offset and shows the notice", async () => {
    const user = userEvent.setup();
    setInvokeHandler("search_folder", (args) =>
      makeResult({
        files: [
          makeFile({
            matches: [
              makeMatch({ line: 1, offset: 3, length: 3 }),
              makeMatch({ line: 2, offset: 12, length: 3 }),
            ],
          }),
        ],
        requestId: args.requestId as number,
      }),
    );

    let capturedEdits: FileEdit[] = [];
    setInvokeHandler("replace_in_files", (args) => {
      capturedEdits = args.edits as FileEdit[];
      const outcomes: ReplaceOutcome[] = [
        { kind: "ok", path: "/proj/spec.md", newMtime: 99, replaced: 2 },
      ];
      return outcomes;
    });

    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(
      <FindReplacePanel
        folder="/proj"
        onSelectMatch={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    await user.type(screen.getByPlaceholderText("Find in folder…"), "foo");
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Replace all" }),
      ).not.toBeDisabled(),
    );
    await user.type(screen.getByPlaceholderText("Replace with…"), "BAR");
    await user.click(screen.getByRole("button", { name: "Replace all" }));

    await waitFor(() =>
      expect(screen.getByText("Replaced 2 in 1 file.")).toBeInTheDocument(),
    );

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(confirmSpy.mock.calls[0][0]).toMatch(/Replace 2/);
    expect(capturedEdits).toHaveLength(1);
    expect(capturedEdits[0].replacements.map((r) => r.offset)).toEqual([
      12, 3,
    ]);
    confirmSpy.mockRestore();
  });

  it("per-match Replace button replaces only that single match", async () => {
    const user = userEvent.setup();
    setInvokeHandler("search_folder", (args) =>
      makeResult({
        files: [
          makeFile({
            matches: [
              makeMatch({ line: 1, offset: 3, length: 3 }),
              makeMatch({ line: 2, offset: 12, length: 3 }),
            ],
          }),
        ],
        requestId: args.requestId as number,
      }),
    );

    let capturedEdits: FileEdit[] = [];
    setInvokeHandler("replace_in_files", (args) => {
      capturedEdits = args.edits as FileEdit[];
      const outcomes: ReplaceOutcome[] = [
        { kind: "ok", path: "/proj/spec.md", newMtime: 99, replaced: 1 },
      ];
      return outcomes;
    });

    render(
      <FindReplacePanel
        folder="/proj"
        onSelectMatch={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    await user.type(screen.getByPlaceholderText("Find in folder…"), "foo");
    await waitFor(() =>
      expect(screen.getAllByRole("button", { name: "Replace" }).length).toBe(2),
    );
    await user.type(screen.getByPlaceholderText("Replace with…"), "BAR");

    const replaceButtons = screen.getAllByRole("button", { name: "Replace" });
    await user.click(replaceButtons[0]);

    await waitFor(() => expect(capturedEdits).toHaveLength(1));
    expect(capturedEdits[0].replacements).toHaveLength(1);
    expect(capturedEdits[0].replacements[0].offset).toBe(3);
  });

  it("Replace all is disabled when there are zero matches", async () => {
    const user = userEvent.setup();
    setInvokeHandler("search_folder", (args) =>
      makeResult({ requestId: args.requestId as number }),
    );

    render(
      <FindReplacePanel
        folder="/proj"
        onSelectMatch={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    await user.type(screen.getByPlaceholderText("Find in folder…"), "foo");
    await waitFor(() =>
      expect(
        screen.getByText(/No matches for/),
      ).toBeInTheDocument(),
    );

    const button = screen.getByRole("button", { name: "Replace all" });
    expect(button).toBeDisabled();
  });
});
