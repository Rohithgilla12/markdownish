import { describe, expect, it, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@tauri-apps/api/core", async () => {
  const { invokeMock } = await import("@/test-utils/tauri-mocks");
  return { invoke: invokeMock };
});

import { QuickOpen } from "./QuickOpen";
import { resetTauriMocks, setInvokeHandler } from "@/test-utils/tauri-mocks";

beforeEach(() => {
  resetTauriMocks();
});

const ALL_FILES = [
  { name: "CLAUDE.md", path: "/proj/CLAUDE.md" },
  { name: "main.rs", path: "/proj/src/main.rs" },
  { name: "package.json", path: "/proj/package.json" },
  { name: "spec.md", path: "/proj/notes/spec.md" },
];

describe("QuickOpen", () => {
  it("lists every file in the folder, not just markdown", async () => {
    setInvokeHandler("list_files", () => ALL_FILES);
    render(<QuickOpen folder="/proj" onSelect={vi.fn()} onClose={vi.fn()} />);

    await waitFor(() => expect(screen.getByText("main.rs")).toBeInTheDocument());
    // Root-level files render the name and the relative path with the same
    // text, so match on "at least one" rather than exactly one.
    expect(screen.getAllByText("package.json").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("CLAUDE.md").length).toBeGreaterThanOrEqual(1);
  });

  it("filters by name and selects with Enter", async () => {
    const user = userEvent.setup();
    setInvokeHandler("list_files", () => ALL_FILES);
    const onSelect = vi.fn();
    render(<QuickOpen folder="/proj" onSelect={onSelect} onClose={vi.fn()} />);

    await waitFor(() => expect(screen.getByText("main.rs")).toBeInTheDocument());
    await user.type(screen.getByPlaceholderText("Open a file…"), "main");
    await user.keyboard("{Enter}");
    expect(onSelect).toHaveBeenCalledWith("/proj/src/main.rs");
  });

  it("shows the relative path for each entry", async () => {
    setInvokeHandler("list_files", () => ALL_FILES);
    render(<QuickOpen folder="/proj" onSelect={vi.fn()} onClose={vi.fn()} />);

    await waitFor(() => expect(screen.getByText("notes/spec.md")).toBeInTheDocument());
  });
});
