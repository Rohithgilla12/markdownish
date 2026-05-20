// Mock for `@tauri-apps/plugin-fs`. We only mirror `watchImmediate` — the
// hook records the callback so tests can synthesise events via
// `window.__pw.emitWatcherEvent`.
import "./_window";

export type UnwatchFn = () => void;

type RawWatchEvent = { type: unknown; paths?: string[] };

export async function watchImmediate(
  _path: string | string[],
  cb: (event: RawWatchEvent) => void,
  _options?: { recursive?: boolean; delayMs?: number },
): Promise<UnwatchFn> {
  window.__pw.watcher = cb;
  return () => {
    if (window.__pw.watcher === cb) window.__pw.watcher = null;
  };
}

export async function watch(
  path: string | string[],
  cb: (event: RawWatchEvent) => void,
  options?: { recursive?: boolean; delayMs?: number },
): Promise<UnwatchFn> {
  return watchImmediate(path, cb, options);
}
