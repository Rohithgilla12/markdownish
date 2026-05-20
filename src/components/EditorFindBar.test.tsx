import { describe, expect, it, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { EditorFindBar } from "./EditorFindBar";
import type { EditorHandle } from "@/components/Editor";

function makeEditorHandle(initial: string): EditorHandle & {
  _text: { current: string };
} {
  const state = { current: initial };
  let selStart = 0;
  let selEnd = 0;
  const handle: EditorHandle = {
    getText: () => state.current,
    setText: (t: string) => {
      state.current = t;
    },
    insertAtSelection: (t: string) => {
      const next =
        state.current.slice(0, selStart) + t + state.current.slice(selEnd);
      state.current = next;
      const caret = selStart + t.length;
      selStart = caret;
      selEnd = caret;
      return true;
    },
    getSelection: () => ({ start: selStart, end: selEnd }),
    setSelection: (start: number, end: number) => {
      selStart = start;
      selEnd = end;
    },
    focusEditor: () => {},
  };
  return Object.assign(handle, { _text: state });
}

beforeEach(() => {
  localStorage.clear();
});

describe("EditorFindBar", () => {
  it("renders nothing when open is false", () => {
    const handle = makeEditorHandle("hello world");
    const { container } = render(
      <EditorFindBar
        editorRef={{ current: handle }}
        open={false}
        initialMode="find"
        onClose={vi.fn()}
        onTextChanged={vi.fn()}
      />,
    );
    expect(container.querySelector('[role="search"]')).toBeNull();
  });

  it("when open, shows the find input and 0 of 0 when query is empty", () => {
    const handle = makeEditorHandle("hello world");
    render(
      <EditorFindBar
        editorRef={{ current: handle }}
        open={true}
        initialMode="find"
        onClose={vi.fn()}
        onTextChanged={vi.fn()}
      />,
    );
    expect(screen.getByPlaceholderText("Find…")).toBeInTheDocument();
    expect(screen.getByText("0 of 0")).toBeInTheDocument();
  });

  it("computes match count for a simple query", async () => {
    const user = userEvent.setup();
    const handle = makeEditorHandle("the cat sat on the mat in the room");
    render(
      <EditorFindBar
        editorRef={{ current: handle }}
        open={true}
        initialMode="find"
        onClose={vi.fn()}
        onTextChanged={vi.fn()}
      />,
    );

    await user.type(screen.getByPlaceholderText("Find…"), "the");
    expect(screen.getByText("1 of 3")).toBeInTheDocument();
    expect(handle.getSelection()).toEqual({ start: 0, end: 3 });
  });

  it("Enter cycles forward, Shift+Enter cycles backward", async () => {
    const user = userEvent.setup();
    const handle = makeEditorHandle("the cat sat on the mat in the room");
    render(
      <EditorFindBar
        editorRef={{ current: handle }}
        open={true}
        initialMode="find"
        onClose={vi.fn()}
        onTextChanged={vi.fn()}
      />,
    );

    const input = screen.getByPlaceholderText("Find…");
    await user.type(input, "the");
    expect(screen.getByText("1 of 3")).toBeInTheDocument();

    await user.keyboard("{Enter}");
    expect(screen.getByText("2 of 3")).toBeInTheDocument();

    await user.keyboard("{Shift>}{Enter}{/Shift}");
    expect(screen.getByText("1 of 3")).toBeInTheDocument();

    await user.keyboard("{Shift>}{Enter}{/Shift}");
    expect(screen.getByText("3 of 3")).toBeInTheDocument();
  });

  it("Esc restores the original selection and calls onClose", async () => {
    const user = userEvent.setup();
    const handle = makeEditorHandle("the cat sat on the mat in the room");
    // Pre-bar selection.
    handle.setSelection(5, 8);

    const onClose = vi.fn();
    render(
      <EditorFindBar
        editorRef={{ current: handle }}
        open={true}
        initialMode="find"
        onClose={onClose}
        onTextChanged={vi.fn()}
      />,
    );

    const input = screen.getByPlaceholderText("Find…");
    // The bar may preseed the query from the selection — clear it then type
    // our own to ensure selection has moved away from {5,8}.
    await user.clear(input);
    await user.type(input, "the");
    // Sanity: selection moved to first match.
    expect(handle.getSelection()).toEqual({ start: 0, end: 3 });

    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(handle.getSelection()).toEqual({ start: 5, end: 8 });
  });

  it("Replace replaces the current match via insertAtSelection", async () => {
    const user = userEvent.setup();
    const handle = makeEditorHandle("abc abc");
    const onTextChanged = vi.fn();
    render(
      <EditorFindBar
        editorRef={{ current: handle }}
        open={true}
        initialMode="replace"
        onClose={vi.fn()}
        onTextChanged={onTextChanged}
      />,
    );

    await user.type(screen.getByPlaceholderText("Find…"), "abc");
    expect(screen.getByText("1 of 2")).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText("Replace with…"), "X");
    await user.click(screen.getByRole("button", { name: "Replace" }));

    expect(handle.getText()).toBe("X abc");
    expect(onTextChanged).toHaveBeenLastCalledWith("X abc");
  });

  it("Replace all replaces all matches in a single call", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const handle = makeEditorHandle("abc abc abc");
    const onTextChanged = vi.fn();
    render(
      <EditorFindBar
        editorRef={{ current: handle }}
        open={true}
        initialMode="replace"
        onClose={vi.fn()}
        onTextChanged={onTextChanged}
      />,
    );

    await user.type(screen.getByPlaceholderText("Find…"), "abc");
    await user.type(screen.getByPlaceholderText("Replace with…"), "X");
    await user.click(screen.getByRole("button", { name: "Replace all" }));

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(confirmSpy.mock.calls[0][0]).toMatch(/3 matches/);
    expect(handle.getText()).toBe("X X X");
    expect(onTextChanged).toHaveBeenLastCalledWith("X X X");
    confirmSpy.mockRestore();
  });

  it("preseeds the query from the editor's existing selection", () => {
    const handle = makeEditorHandle("hello FOO world");
    handle.setSelection(6, 9);
    render(
      <EditorFindBar
        editorRef={{ current: handle }}
        open={true}
        initialMode="find"
        onClose={vi.fn()}
        onTextChanged={vi.fn()}
      />,
    );

    const input = screen.getByPlaceholderText("Find…") as HTMLInputElement;
    expect(input.value).toBe("FOO");
    expect(screen.getByText("1 of 1")).toBeInTheDocument();
  });

  it("zero-width regex matches do not infinite loop", async () => {
    const user = userEvent.setup();
    const handle = makeEditorHandle("abc def");
    render(
      <EditorFindBar
        editorRef={{ current: handle }}
        open={true}
        initialMode="find"
        onClose={vi.fn()}
        onTextChanged={vi.fn()}
      />,
    );

    // Toggle regex on.
    await user.click(screen.getByRole("button", { name: ".*" }));
    // Type \b. We type as two chars so userEvent doesn't treat it special.
    await user.type(screen.getByPlaceholderText("Find…"), "\\b");

    // The key assertion is that we reach this point — no timeout, no freeze.
    // A match count should be rendered (either "N of M" or "0 of 0").
    const counter =
      screen.queryByText(/\d+ of \d+/) ?? screen.queryByText("0 of 0");
    expect(counter).not.toBeNull();
  });
});
