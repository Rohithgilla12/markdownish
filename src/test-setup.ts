import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// requestAnimationFrame in jsdom is unreliable enough that several of
// our components (which call rAF in useEffect for entrance animations
// and selection-after-paint) flake. Patch it to a microtask-ish
// scheduler so tests stay deterministic.
if (typeof window !== "undefined") {
  window.requestAnimationFrame = (cb: FrameRequestCallback): number => {
    return window.setTimeout(() => cb(performance.now()), 0) as unknown as number;
  };
  window.cancelAnimationFrame = (id: number): void => {
    window.clearTimeout(id);
  };
}
