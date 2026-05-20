// Mock for `@tauri-apps/api/app`. `useUpdater` calls `getVersion` when
// surfacing the "up to date" state — return a constant so the verbose
// path doesn't throw.
export async function getVersion(): Promise<string> {
  return "0.0.0-e2e";
}

export async function getName(): Promise<string> {
  return "Markdownish";
}

export async function getTauriVersion(): Promise<string> {
  return "2.0.0";
}
