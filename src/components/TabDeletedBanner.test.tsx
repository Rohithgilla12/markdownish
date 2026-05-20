import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { TabDeletedBanner } from "./TabDeletedBanner";

describe("TabDeletedBanner", () => {
  it("renders the message and both buttons", () => {
    render(<TabDeletedBanner onSave={vi.fn()} onClose={vi.fn()} />);
    expect(
      screen.getByText(
        "This file was deleted on disk while you were editing.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
  });

  it("Save button calls onSave", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const onClose = vi.fn();
    render(<TabDeletedBanner onSave={onSave} onClose={onClose} />);
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("Close button shows a confirm and calls onClose if confirmed", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const onClose = vi.fn();
    render(<TabDeletedBanner onSave={vi.fn()} onClose={onClose} />);
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(confirmSpy.mock.calls[0][0]).toMatch(/lost/);
    expect(onClose).toHaveBeenCalledTimes(1);
    confirmSpy.mockRestore();
  });

  it("Close button does nothing if confirm is cancelled", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    const onClose = vi.fn();
    render(<TabDeletedBanner onSave={vi.fn()} onClose={onClose} />);
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });
});
