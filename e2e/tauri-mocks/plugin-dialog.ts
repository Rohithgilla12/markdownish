// Mock for `@tauri-apps/plugin-dialog`. The real `open` returns a string,
// string[], or null depending on options. Tests stub it via the shared
// handler bag under the synthetic "dialogOpen" key.
import "./_window";

type OpenOptions = {
  directory?: boolean;
  multiple?: boolean;
  defaultPath?: string;
  title?: string;
};

type OpenResult = string | string[] | null;

export async function open(opts?: OpenOptions): Promise<OpenResult> {
  const fn = window.__pw.handlers.dialogOpen;
  if (!fn) return null;
  const result = (await fn(
    (opts as unknown as Record<string, unknown>) ?? {},
  )) as OpenResult;
  return result ?? null;
}

export async function save(_opts?: OpenOptions): Promise<string | null> {
  const fn = window.__pw.handlers.dialogSave;
  if (!fn) return null;
  return ((await fn({})) as string | null) ?? null;
}

export async function confirm(_message: string): Promise<boolean> {
  return true;
}

export async function ask(_message: string): Promise<boolean> {
  return true;
}

export async function message(_message: string): Promise<void> {
  /* no-op */
}
