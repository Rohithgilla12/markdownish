// Mock for `@tauri-apps/plugin-updater`. `check()` returning null short-
// circuits `useUpdater` into the idle state.
import "./_window";

export type DownloadEvent =
  | { event: "Started"; data: { contentLength: number | null } }
  | { event: "Progress"; data: { chunkLength: number } }
  | { event: "Finished" };

export type Update = {
  version: string;
  date?: string;
  body?: string;
  downloadAndInstall: (
    onEvent?: (event: DownloadEvent) => void,
  ) => Promise<void>;
};

export async function check(): Promise<Update | null> {
  return null;
}
