// Mock for `@tauri-apps/plugin-opener`. The app uses `openUrl` to open
// links in the system browser — in the browser we just no-op.
import "./_window";

export async function openUrl(_url: string, _with?: string): Promise<void> {
  /* no-op */
}

export async function openPath(_path: string, _with?: string): Promise<void> {
  /* no-op */
}

export async function revealItemInDir(_path: string): Promise<void> {
  /* no-op */
}
