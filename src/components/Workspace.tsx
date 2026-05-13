import { useState } from "react";
import { Sidebar } from "@/components/Sidebar";
import { useFolder } from "@/hooks/useFolder";

type Props = { folder: string; onChangeFolder: () => void };

export function Workspace({ folder, onChangeFolder }: Props) {
  const { tree, loading, error } = useFolder(folder);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [unsavedPaths] = useState<Set<string>>(new Set());

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

      <section className="grid h-full place-items-center overflow-hidden">
        {selectedPath ? (
          <div className="text-center">
            <div className="text-eyebrow mb-3 text-[color:var(--color-foil)]">Selected</div>
            <p className="font-display text-2xl text-foreground">{selectedPath.split(/[\\/]/).pop()}</p>
            <p className="text-marginalia mt-4 max-w-md break-all">{selectedPath}</p>
            <p className="text-marginalia mt-6">Editor lands next phase.</p>
          </div>
        ) : (
          <div className="text-center">
            <div className="text-eyebrow mb-3">A folder is open</div>
            <p className="font-display text-3xl italic text-[color:var(--color-fg-2)]">
              Pick a file from the sidebar.
            </p>
          </div>
        )}
      </section>
    </main>
  );
}
