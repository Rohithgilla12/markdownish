import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { EmptyState } from "@/components/EmptyState";
import { Workspace } from "@/components/Workspace";

export default function App() {
  const [folder, setFolder] = useState<string | null>(null);

  async function pickFolder() {
    const picked = await open({ directory: true, multiple: false });
    if (typeof picked === "string") setFolder(picked);
  }

  return (
    <div className="h-screen w-screen text-foreground antialiased">
      {/* The top strip is draggable so users can move the window without a visible chrome. */}
      <div className="drag fixed inset-x-0 top-0 z-50 h-8" />

      {folder ? <Workspace folder={folder} onChangeFolder={pickFolder} /> : <EmptyState onOpen={pickFolder} />}
    </div>
  );
}
