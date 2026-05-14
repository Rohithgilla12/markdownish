import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { EmptyState } from "@/components/EmptyState";
import { Workspace } from "@/components/Workspace";
import { UpdateBanner } from "@/components/UpdateBanner";
import { ThemePicker } from "@/components/ThemePicker";
import { useRecentFolders } from "@/hooks/useRecentFolders";
import { useTheme } from "@/hooks/useTheme";
import { useUpdater } from "@/hooks/useUpdater";

type OpenPath = { folder: string; file: string | null };

export default function App() {
  const [folder, setFolder] = useState<string | null>(null);
  const [initialFile, setInitialFile] = useState<string | null>(null);
  const { folders: recent, remember, forget } = useRecentFolders();
  const { theme, commit, preview, revert } = useTheme();
  const [showThemePicker, setShowThemePicker] = useState(false);
  const updater = useUpdater();

  function applyOpen(payload: OpenPath) {
    setFolder(payload.folder);
    setInitialFile(payload.file);
    remember(payload.folder);
  }

  async function pickFolder() {
    const picked = await open({ directory: true, multiple: false });
    if (typeof picked === "string") {
      applyOpen({ folder: picked, file: null });
    }
  }

  function openRecent(path: string) {
    applyOpen({ folder: path, file: null });
  }

  useEffect(() => {
    invoke<OpenPath | null>("take_launch_folder").then((open) => {
      if (open) applyOpen(open);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const unlisten = listen<OpenPath>("open-path", (event) => applyOpen(event.payload));
    return () => {
      void unlisten.then((fn) => fn());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const webview = getCurrentWebview();
    const unlisten = webview.onDragDropEvent(async (event) => {
      if (event.payload.type !== "drop") return;
      const paths = event.payload.paths;
      if (!paths || paths.length === 0) return;
      for (const p of paths) {
        const resolved = await invoke<OpenPath | null>("resolve_path", { path: p });
        if (resolved) {
          applyOpen(resolved);
          return;
        }
      }
    });
    return () => {
      void unlisten.then((fn) => fn());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cmd+, → theme picker. macOS preferences shortcut.
  // Cmd+U → manual check for updates (the auto-check on launch still runs).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      if (e.key === ",") {
        e.preventDefault();
        setShowThemePicker((v) => !v);
      } else if (e.key.toLowerCase() === "u") {
        e.preventDefault();
        void updater.check(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [updater]);

  return (
    <div className="h-screen w-screen text-foreground antialiased">
      {folder ? (
        <Workspace
          key={folder}
          folder={folder}
          initialFile={initialFile}
          onChangeFolder={pickFolder}
        />
      ) : (
        <EmptyState
          onOpen={pickFolder}
          recent={recent}
          onOpenRecent={openRecent}
          onForget={forget}
        />
      )}

      <UpdateBanner state={updater.state} onInstall={updater.install} onDismiss={updater.dismiss} />

      {showThemePicker && (
        <ThemePicker
          currentTheme={theme}
          onPreview={preview}
          onCommit={commit}
          onRevert={revert}
          onClose={() => setShowThemePicker(false)}
        />
      )}
    </div>
  );
}
