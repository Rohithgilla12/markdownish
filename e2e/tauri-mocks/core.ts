// Mock for `@tauri-apps/api/core` — only the bits the app touches.
import "./_window";

export async function invoke<T = unknown>(
  name: string,
  args?: Record<string, unknown>,
): Promise<T> {
  const fn = window.__pw.handlers[name];
  if (!fn) {
    throw new Error(`pw-tauri-mock: no handler for invoke("${name}")`);
  }
  return fn(args ?? {}) as Promise<T>;
}

// `convertFileSrc` is used by `src/lib/assets.ts` to rewrite asset URLs for
// the WebView. In the browser there's no `asset://` scheme — just hand the
// path back so <img> tags don't break.
export function convertFileSrc(path: string, _protocol?: string): string {
  return path;
}
