import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FileNode } from "@/lib/types";

type Props = {
  node: FileNode;
  level: number;
  selectedPath: string | null;
  unsavedPaths: Set<string>;
  onSelect: (path: string) => void;
};

export function FileTreeEntry({ node, level, selectedPath, unsavedPaths, onSelect }: Props) {
  // Collapsed by default — CLAUDE.md asked for collapsed-by-default for deep trees.
  const [open, setOpen] = useState(level === 0);

  if (node.isDir) {
    return (
      <div>
        <button
          onClick={() => setOpen((v) => !v)}
          style={{ paddingLeft: `${level * 14 + 8}px` }}
          className="group flex w-full items-center gap-1.5 rounded-md py-1.5 pr-2 text-left text-sm transition-colors hover:bg-[color:var(--color-surface-2)]/50"
        >
          <ChevronRight
            className={cn(
              "h-3 w-3 shrink-0 text-[color:var(--color-fg-dim)] transition-transform duration-150 ease-[var(--ease-out-quart)]",
              open && "rotate-90",
            )}
            strokeWidth={2}
          />
          <span className="truncate font-display italic text-[color:var(--color-fg-2)] group-hover:text-foreground">
            {node.name}
          </span>
        </button>
        {open && (
          <div>
            {node.children.map((child) => (
              <FileTreeEntry
                key={child.path}
                node={child}
                level={level + 1}
                selectedPath={selectedPath}
                unsavedPaths={unsavedPaths}
                onSelect={onSelect}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  const isActive = selectedPath === node.path;
  const isUnsaved = unsavedPaths.has(node.path);

  return (
    <button
      onClick={() => onSelect(node.path)}
      style={{ paddingLeft: `${level * 14 + 22}px` }}
      className={cn(
        "group flex w-full items-center gap-2 rounded-md py-1.5 pr-2 text-left text-sm transition-colors",
        isActive
          ? "bg-[color:var(--color-foil)]/[0.10] text-[color:var(--color-foil)]"
          : "text-[color:var(--color-fg-2)] hover:bg-[color:var(--color-surface-2)]/40 hover:text-foreground",
      )}
    >
      <span className="flex-1 truncate font-display">{node.name}</span>
      {isUnsaved ? (
        <span
          aria-label="unsaved"
          className="h-1.5 w-1.5 shrink-0 rounded-full bg-[color:var(--color-foil)]"
        />
      ) : isActive ? (
        <span className="shrink-0 font-mono text-xs text-[color:var(--color-foil)]">❦</span>
      ) : null}
    </button>
  );
}
