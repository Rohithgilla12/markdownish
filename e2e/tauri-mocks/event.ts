// Mock for `@tauri-apps/api/event`. Tests don't drive event channels for
// the current scenarios, so `listen` is a no-op that resolves to a no-op
// unlisten.
import "./_window";

export type UnlistenFn = () => void;

export async function listen<T = unknown>(
  _name: string,
  _cb: (event: { payload: T }) => void,
): Promise<UnlistenFn> {
  return () => {};
}

export async function once<T = unknown>(
  _name: string,
  _cb: (event: { payload: T }) => void,
): Promise<UnlistenFn> {
  return () => {};
}

export async function emit(_name: string, _payload?: unknown): Promise<void> {
  /* no-op */
}
