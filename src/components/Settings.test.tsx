import { describe, expect, it, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@tauri-apps/api/app", () => ({
  getVersion: () => Promise.resolve("0.1.20"),
}));

import { Settings } from "./Settings";
import type { UpdaterState } from "@/hooks/useUpdater";

beforeEach(() => {
  vi.clearAllMocks();
});

function makeUpdater(state: UpdaterState = { kind: "idle" }) {
  return { state, check: vi.fn(), install: vi.fn() };
}

describe("Settings", () => {
  it("shows the app version", async () => {
    render(
      <Settings
        themeId="vellum"
        updater={makeUpdater()}
        onOpenTheme={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByText(/0\.1\.20/)).toBeInTheDocument());
  });

  it("check for updates button triggers a verbose check", async () => {
    const user = userEvent.setup();
    const updater = makeUpdater();
    render(
      <Settings
        themeId="vellum"
        updater={updater}
        onOpenTheme={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Check for updates" }));
    expect(updater.check).toHaveBeenCalledWith(true);
  });

  it("shows install button when an update is available", async () => {
    const user = userEvent.setup();
    const updater = makeUpdater({
      kind: "available",
      update: { version: "0.2.0" } as never,
    });
    render(
      <Settings
        themeId="vellum"
        updater={updater}
        onOpenTheme={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText(/0\.2\.0/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Install/ }));
    expect(updater.install).toHaveBeenCalledTimes(1);
  });

  it("theme row opens the theme picker", async () => {
    const user = userEvent.setup();
    const onOpenTheme = vi.fn();
    render(
      <Settings
        themeId="vellum"
        updater={makeUpdater()}
        onOpenTheme={onOpenTheme}
        onClose={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: /Theme/ }));
    expect(onOpenTheme).toHaveBeenCalledTimes(1);
  });

  it("Escape closes", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Settings
        themeId="vellum"
        updater={makeUpdater()}
        onOpenTheme={vi.fn()}
        onClose={onClose}
      />,
    );
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
