// Mock for `@tauri-apps/plugin-process`. Relaunch is a no-op under
// Playwright — there's no real Tauri shell to restart.
export async function relaunch(): Promise<void> {
  /* no-op */
}

export async function exit(_code = 0): Promise<void> {
  /* no-op */
}
