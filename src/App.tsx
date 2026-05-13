import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { EmptyState } from "@/components/EmptyState";
import { Workspace } from "@/components/Workspace";

type OpenPath = { folder: string; file: string | null };

export default function App() {
  const [folder, setFolder] = useState<string | null>(null);
  const [initialFile, setInitialFile] = useState<string | null>(null);

  async function pickFolder() {
    const picked = await open({ directory: true, multiple: false });
    if (typeof picked === "string") {
      setFolder(picked);
      setInitialFile(null);
    }
  }

  // Claim the launch folder (CLI arg) on first mount.
  useEffect(() => {
    invoke<OpenPath | null>("take_launch_folder").then((open) => {
      if (open) {
        setFolder(open.folder);
        setInitialFile(open.file);
      }
    });
  }, []);

  // Listen for subsequent `open -a Markdownish …` invocations (RunEvent::Opened on macOS).
  useEffect(() => {
    const unlisten = listen<OpenPath>("open-path", (event) => {
      setFolder(event.payload.folder);
      setInitialFile(event.payload.file);
    });
    return () => {
      void unlisten.then((fn) => fn());
    };
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
        <EmptyState onOpen={pickFolder} />
      )}
    </div>
  );
}
