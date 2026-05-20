// Shared mutable surface that every Tauri mock module talks to. Tests
// configure handlers/events by writing to `window.__pw`; the modules read
// from it at call time. We don't try to capture state at import time —
// Playwright's `addInitScript` runs *before* the page's modules load, so
// the bag is always present when the React app first reaches for a mock.

type Handler = (args: Record<string, unknown>) => unknown | Promise<unknown>;

export type WatcherEventShape = { type: unknown; paths?: string[] };

declare global {
  interface Window {
    __pw: {
      handlers: Record<string, Handler>;
      watcher: ((event: WatcherEventShape) => void) | null;
      emitWatcherEvent: (event: WatcherEventShape) => void;
      reset: () => void;
    };
  }
}

if (typeof window !== "undefined" && !window.__pw) {
  window.__pw = {
    handlers: {},
    watcher: null,
    emitWatcherEvent: (event) => {
      if (window.__pw.watcher) window.__pw.watcher(event);
    },
    reset: () => {
      window.__pw.handlers = {};
      window.__pw.watcher = null;
    },
  };
}

export {};
