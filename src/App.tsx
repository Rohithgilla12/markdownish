import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { EmptyState } from "@/components/EmptyState";
import { Workspace } from "@/components/Workspace";
import { useRecentFolders } from "@/hooks/useRecentFolders";

type OpenPath = { folder: string; file: string | null };

export default function App() {
  const [folder, setFolder] = useState<string | null>(null);
  const [initialFile, setInitialFile] = useState<string | null>(null);
  const { folders: recent, remember, forget } = useRecentFolders();

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

  // Claim the launch folder on first mount.
  useEffect(() => {
    invoke<OpenPath | null>("take_launch_folder").then((open) => {
      if (open) applyOpen(open);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Listen for runtime opens (`open -a Markdownish …` while the app is running).
  useEffect(() => {
    const unlisten = listen<OpenPath>("open-path", (event) => applyOpen(event.payload));
    return () => {
      void unlisten.then((fn) => fn());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Drag-and-drop: dropped folders open directly; dropped .md files open their parent
  // folder and select the file.
  useEffect(() => {
    const webview = getCurrentWebview();
    const unlisten = webview.onDragDropEvent(async (event) => {
      if (event.payload.type !== "drop") return;
      const paths = event.payload.paths;
      if (!paths || paths.length === 0) return;
      // Pick the first path that resolves into something useful.
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

  return (
    <div className="h-screen w-screen text-foreground antialiased">
      <div className="drag fixed inset-x-0 top-0 z-50 h-8" />

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
    </div>
  );
}
