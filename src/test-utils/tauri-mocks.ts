import { vi, type Mock } from "vitest";

// Tauri command handlers — keyed by command name. Tests register
// handlers via `setInvokeHandler` before triggering code that calls
// invoke(name, args). Unhandled commands throw to make missing
// stubs obvious during test debugging.
type Handler = (args: Record<string, unknown>) => unknown | Promise<unknown>;
const handlers = new Map<string, Handler>();

export const invokeMock: Mock = vi.fn(async (name: string, args?: Record<string, unknown>) => {
  const fn = handlers.get(name);
  if (!fn) {
    throw new Error(`tauri-mocks: no handler registered for invoke("${name}")`);
  }
  return fn(args ?? {});
});

export function setInvokeHandler(command: string, fn: Handler) {
  handlers.set(command, fn);
}

export function clearInvokeHandlers() {
  handlers.clear();
  invokeMock.mockClear();
}

// File watcher mock — emit events through `emitWatcherEvent`. The
// test holds the watcher's callback in `currentWatchCallback`; null
// when no watcher is active.
type WatchCallback = (event: { type: unknown; paths?: string[] }) => void;
type WatchOptions = { recursive?: boolean; delayMs?: number };

let currentWatchCallback: WatchCallback | null = null;
let currentWatchPath: string | null = null;

export const watchImmediateMock: Mock = vi.fn(
  async (path: string, cb: WatchCallback, _options?: WatchOptions) => {
    currentWatchCallback = cb;
    currentWatchPath = path;
    // Return an unwatch function.
    return () => {
      if (currentWatchCallback === cb) {
        currentWatchCallback = null;
        currentWatchPath = null;
      }
    };
  },
);

export function emitWatcherEvent(event: { type: unknown; paths?: string[] }) {
  if (!currentWatchCallback) {
    throw new Error("tauri-mocks: no active watcher to emit to");
  }
  currentWatchCallback(event);
}

export function getActiveWatchPath(): string | null {
  return currentWatchPath;
}

export function isWatcherActive(): boolean {
  return currentWatchCallback !== null;
}

export function resetWatcherMock() {
  currentWatchCallback = null;
  currentWatchPath = null;
  watchImmediateMock.mockClear();
}

export function resetTauriMocks() {
  clearInvokeHandlers();
  resetWatcherMock();
}
