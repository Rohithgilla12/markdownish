import { describe, expect, it, beforeEach } from "vitest";

// vi.mock factories are hoisted above static imports, so we resolve
// the shared mock implementations via dynamic import inside the
// factory. Subsequent phases that need these mocks should follow
// the same pattern.
vi.mock("@tauri-apps/api/core", async () => {
  const { invokeMock } = await import("./tauri-mocks");
  return { invoke: invokeMock };
});
vi.mock("@tauri-apps/plugin-fs", async () => {
  const actual = await vi.importActual<object>("@tauri-apps/plugin-fs");
  const { watchImmediateMock } = await import("./tauri-mocks");
  return { ...actual, watchImmediate: watchImmediateMock };
});

import { invoke } from "@tauri-apps/api/core";
import { watchImmediate } from "@tauri-apps/plugin-fs";
import {
  setInvokeHandler,
  emitWatcherEvent,
  resetTauriMocks,
} from "./tauri-mocks";

beforeEach(() => {
  resetTauriMocks();
});

describe("tauri-mocks smoke", () => {
  it("invoke goes through registered handler", async () => {
    setInvokeHandler("stat_mtime", (args) => {
      expect(args.path).toBe("/x");
      return 42;
    });
    await expect(invoke<number>("stat_mtime", { path: "/x" })).resolves.toBe(42);
  });

  it("invoke throws for unregistered commands", async () => {
    await expect(invoke("nothing")).rejects.toThrow(/no handler registered/);
  });

  it("watchImmediate captures the callback and emit triggers it", async () => {
    const events: unknown[] = [];
    await watchImmediate("/folder", (e) => events.push(e), { recursive: true });
    emitWatcherEvent({ type: { modify: { kind: "any" } }, paths: ["/folder/a.md"] });
    expect(events).toHaveLength(1);
  });
});
