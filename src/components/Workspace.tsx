import { useEffect, useMemo, useState } from "react";
import { Sidebar } from "@/components/Sidebar";
import { Editor } from "@/components/Editor";
import { useFolder } from "@/hooks/useFolder";
import { useFile } from "@/hooks/useFile";

type Props = { folder: string; onChangeFolder: () => void };

export function Workspace({ folder, onChangeFolder }: Props) {
  const { tree, loading, error } = useFolder(folder);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const file = useFile(selectedPath);

  // Track which paths have unsaved changes — currently just the open one,
  // but the set lets us extend to multi-file scenarios later.
  const unsavedPaths = useMemo(() => {
    const s = new Set<string>();
    if (selectedPath && file.dirty) s.add(selectedPath);
    return s;
  }, [selectedPath, file.dirty]);

  // Reflect unsaved state in the window title so the OS shows the asterisk.
  useEffect(() => {
    const base = selectedPath ? selectedPath.split(/[\\/]/).pop() : "Markdownish";
    document.title = file.dirty ? `● ${base}` : (base ?? "Markdownish");
  }, [selectedPath, file.dirty]);

  return (
    <main className="grid h-full grid-cols-[280px_1fr] overflow-hidden">
      <Sidebar
        folder={folder}
        tree={tree}
        loading={loading}
        error={error}
        selectedPath={selectedPath}
        unsavedPaths={unsavedPaths}
        onSelect={setSelectedPath}
        onChangeFolder={onChangeFolder}
      />

      <section className="h-full min-h-0 overflow-hidden">
        {selectedPath && file.status !== "idle" ? (
          <Editor
            key={selectedPath}
            path={selectedPath}
            content={file.content}
            onChange={file.setContent}
            onSave={file.save}
            dirty={file.dirty}
          />
        ) : (
          <div className="grid h-full place-items-center">
            <div className="text-center">
              <div className="text-eyebrow mb-3">A folder is open</div>
              <p className="font-display text-3xl italic text-[color:var(--color-fg-2)]">
                Pick a file from the sidebar.
              </p>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
