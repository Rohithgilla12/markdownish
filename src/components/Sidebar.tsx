import { useMemo } from "react";
import { ChevronsUpDown, FolderOpen } from "lucide-react";
import { FileTreeEntry } from "@/components/FileTree";
import { PINNED_NAMES, type FileNode } from "@/lib/types";
import { cn } from "@/lib/utils";

type Props = {
  folder: string;
  tree: FileNode | null;
  loading: boolean;
  error: string | null;
  selectedPath: string | null;
  unsavedPaths: Set<string>;
  onSelect: (path: string) => void;
  onChangeFolder: () => void;
};

function basename(p: string): string {
  return p.split(/[\\/]/).filter(Boolean).pop() ?? p;
}

export function Sidebar({
  folder,
  tree,
  loading,
  error,
  selectedPath,
  unsavedPaths,
  onSelect,
  onChangeFolder,
}: Props) {
  // Pinned files: only root-level matches, in the canonical order from CLAUDE.md.
  const pinned = useMemo(() => {
    if (!tree) return [];
    const byName = new Map(tree.children.filter((c) => !c.isDir).map((c) => [c.name, c]));
    return PINNED_NAMES.map((n) => byName.get(n)).filter((n): n is FileNode => Boolean(n));
  }, [tree]);

  const pinnedPaths = useMemo(() => new Set(pinned.map((n) => n.path)), [pinned]);

  // The tree, with pinned root-level files filtered out so they don't appear twice.
  const treeChildren = useMemo(
    () => (tree ? tree.children.filter((c) => c.isDir || !pinnedPaths.has(c.path)) : []),
    [tree, pinnedPaths],
  );

  return (
    <aside className="flex h-full min-h-0 flex-col border-r border-[color:var(--color-rule-soft)] bg-[color:var(--color-bg)]/60">
      {/* Folder header — draggable, with the current folder name + change action */}
      <header
        data-tauri-drag-region
        className="shrink-0 px-5 pb-3 pt-10"
      >
        <button
          onClick={onChangeFolder}
          className={cn(
            "group flex w-full items-center gap-2 rounded-md px-2 py-2",
            "text-left transition-colors hover:bg-[color:var(--color-surface-2)]/40",
          )}
        >
          <FolderOpen
            className="h-4 w-4 shrink-0 text-[color:var(--color-foil)]"
            strokeWidth={1.5}
          />
          <div className="min-w-0 flex-1">
            <div className="truncate font-display text-base leading-tight text-foreground">
              {basename(folder)}
            </div>
            <div className="text-marginalia mt-0.5 truncate">{folder}</div>
          </div>
          <ChevronsUpDown
            className="h-3.5 w-3.5 shrink-0 text-[color:var(--color-fg-faint)] opacity-0 transition-opacity group-hover:opacity-100"
            strokeWidth={2}
          />
        </button>
      </header>

      <div className="rule-hair mx-5 shrink-0" />

      {/* Body — scrollable */}
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
        {loading && (
          <div className="text-marginalia px-3 py-6">Reading folder…</div>
        )}

        {error && (
          <div className="mx-2 rounded-md border border-[color:var(--color-rule)] bg-[color:var(--color-surface)]/60 p-3">
            <div className="text-eyebrow mb-1 text-[color:var(--color-foil)]">Empty</div>
            <p className="font-display text-sm italic leading-snug text-[color:var(--color-fg-2)]">
              {error}
            </p>
          </div>
        )}

        {!loading && !error && tree && (
          <>
            {pinned.length > 0 && (
              <section className="mb-4">
                <div className="px-3 pb-1 font-display text-sm italic text-[color:var(--color-foil)]">
                  Pinned
                </div>
                <div className="space-y-0.5">
                  {pinned.map((node) => (
                    <FileTreeEntry
                      key={node.path}
                      node={node}
                      level={0}
                      selectedPath={selectedPath}
                      unsavedPaths={unsavedPaths}
                      onSelect={onSelect}
                    />
                  ))}
                </div>
              </section>
            )}

            <section>
              <div className="px-3 pb-1 font-display text-sm italic text-[color:var(--color-foil)]">
                {pinned.length > 0 ? "The Tree" : "Files"}
              </div>
              <div className="space-y-0.5">
                {treeChildren.length === 0 ? (
                  <div className="text-marginalia px-3 py-2">No other markdown.</div>
                ) : (
                  treeChildren.map((node) => (
                    <FileTreeEntry
                      key={node.path}
                      node={node}
                      level={0}
                      selectedPath={selectedPath}
                      unsavedPaths={unsavedPaths}
                      onSelect={onSelect}
                    />
                  ))
                )}
              </div>
            </section>
          </>
        )}
      </div>

      {/* Footer — colophon */}
      <footer className="shrink-0 border-t border-[color:var(--color-rule-soft)] px-5 py-3">
        <div className="text-marginalia flex items-center justify-between">
          <span>
            <b className="font-normal text-[color:var(--color-foil)]">Markdownish</b> v0.1
          </span>
          <span>{tree ? countMarkdown(tree) : 0} files</span>
        </div>
      </footer>
    </aside>
  );
}

function countMarkdown(node: FileNode): number {
  if (!node.isDir) return 1;
  return node.children.reduce((sum, c) => sum + countMarkdown(c), 0);
}
