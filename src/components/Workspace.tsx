import { useEffect, useMemo, useState } from "react";
import { Sidebar } from "@/components/Sidebar";
import { Editor } from "@/components/Editor";
import { Preview } from "@/components/Preview";
import { ViewToggle, type ViewMode } from "@/components/ViewToggle";
import { ConflictToast } from "@/components/ConflictToast";
import { useFolder } from "@/hooks/useFolder";
import { useFile } from "@/hooks/useFile";
import { cn } from "@/lib/utils";

type Props = { folder: string; initialFile?: string | null; onChangeFolder: () => void };

export function Workspace({ folder, initialFile, onChangeFolder }: Props) {
  const { tree, loading, error } = useFolder(folder);
  const [selectedPath, setSelectedPath] = useState<string | null>(initialFile ?? null);
  const file = useFile(selectedPath);
  const [view, setView] = useState<ViewMode>("split");

  const unsavedPaths = useMemo(() => {
    const s = new Set<string>();
    if (selectedPath && file.dirty) s.add(selectedPath);
    return s;
  }, [selectedPath, file.dirty]);

  useEffect(() => {
    const base = selectedPath ? selectedPath.split(/[\\/]/).pop() : "Markdownish";
    document.title = file.dirty ? `● ${base}` : (base ?? "Markdownish");
  }, [selectedPath, file.dirty]);

  // Cmd+\ toggles preview pane through editor → split → preview → editor.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "\\") {
        e.preventDefault();
        setView((m) => (m === "editor" ? "split" : m === "split" ? "preview" : "editor"));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const showEditor = view !== "preview";
  const showPreview = view !== "editor";

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

      <section className="relative h-full min-h-0 overflow-hidden">
        {/* View toggle — pinned top-right, floats over the editor/preview */}
        {selectedPath && (
          <div className="pointer-events-none absolute right-5 top-3 z-20 flex">
            <div className="pointer-events-auto">
              <ViewToggle mode={view} onChange={setView} />
            </div>
          </div>
        )}

        {file.conflict && (
          <ConflictToast
            onReload={() => file.resolveConflict("reload")}
            onKeep={() => file.resolveConflict("keep")}
          />
        )}

        {selectedPath && file.status !== "idle" ? (
          <div
            className={cn(
              "grid h-full min-h-0",
              showEditor && showPreview && "grid-cols-2 divide-x divide-[color:var(--color-rule-soft)]",
              showEditor && !showPreview && "grid-cols-1",
              !showEditor && showPreview && "grid-cols-1",
            )}
          >
            {showEditor && (
              <Editor
                key={selectedPath}
                path={selectedPath}
                content={file.content}
                onChange={file.setContent}
                onSave={file.save}
                dirty={file.dirty}
              />
            )}
            {showPreview && <Preview source={file.content} />}
          </div>
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
