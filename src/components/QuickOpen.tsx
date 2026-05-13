import { useEffect, useMemo, useRef, useState } from "react";
import { CornerDownLeft, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FileNode } from "@/lib/types";

type Props = {
  tree: FileNode | null;
  folder: string;
  onSelect: (path: string) => void;
  onClose: () => void;
};

function flatten(node: FileNode): FileNode[] {
  if (!node.isDir) return [node];
  return node.children.flatMap(flatten);
}

function score(name: string, path: string, q: string): number {
  if (!q) return 1;
  const ln = name.toLowerCase();
  const lp = path.toLowerCase();
  const lq = q.toLowerCase();
  if (ln === lq) return 1000;
  if (ln.startsWith(lq)) return 500;
  if (ln.includes(lq)) return 200;
  if (lp.includes(lq)) return 50;
  return 0;
}

export function QuickOpen({ tree, folder, onSelect, onClose }: Props) {
  const [q, setQ] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const files = useMemo(() => (tree ? flatten(tree) : []), [tree]);

  const results = useMemo(() => {
    if (!q.trim()) return files.slice(0, 50);
    return files
      .map((f) => ({ f, s: score(f.name, f.path, q.trim()) }))
      .filter((r) => r.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 50)
      .map((r) => r.f);
  }, [files, q]);

  // Reset cursor when results change.
  useEffect(() => {
    setCursor(0);
  }, [q]);

  // Focus the input on mount.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Keep selected row visible.
  useEffect(() => {
    const el = listRef.current?.children[cursor] as HTMLElement | undefined;
    if (el) el.scrollIntoView({ block: "nearest" });
  }, [cursor, results]);

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => Math.min(c + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const pick = results[cursor];
      if (pick) onSelect(pick.path);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-start pt-[15vh]"
      onMouseDown={onClose}
    >
      <div
        className="absolute inset-0 bg-[color:var(--color-bg)]/75 backdrop-blur-sm"
        aria-hidden
      />
      <div
        onMouseDown={(e) => e.stopPropagation()}
        className="relative mx-auto w-[min(680px,92vw)] overflow-hidden rounded-xl border border-[color:var(--color-rule)] bg-[color:var(--color-surface)]/95 shadow-[0_50px_120px_-30px_rgba(0,0,0,0.7)]"
      >
        <div className="flex items-center gap-3 border-b border-[color:var(--color-rule-soft)] px-4 py-3">
          <Search className="h-4 w-4 shrink-0 text-[color:var(--color-foil)]" strokeWidth={1.5} />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Open a file…"
            className="w-full bg-transparent font-display text-lg italic text-foreground placeholder:text-[color:var(--color-fg-faint)] focus:outline-none"
          />
          <span className="text-marginalia shrink-0">
            {results.length} / {files.length}
          </span>
        </div>

        <div
          ref={listRef}
          className="max-h-[50vh] overflow-y-auto"
        >
          {results.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <p className="font-display italic text-[color:var(--color-fg-2)]">
                Nothing matches “{q}”.
              </p>
            </div>
          ) : (
            results.map((f, i) => {
              const isActive = i === cursor;
              const rel = f.path.startsWith(folder)
                ? f.path.slice(folder.length).replace(/^[\\/]+/, "")
                : f.path;
              return (
                <button
                  key={f.path}
                  onMouseEnter={() => setCursor(i)}
                  onClick={() => onSelect(f.path)}
                  className={cn(
                    "flex w-full items-center gap-3 px-5 py-2.5 text-left transition-colors",
                    isActive
                      ? "bg-[color:var(--color-foil)]/[0.10]"
                      : "hover:bg-[color:var(--color-surface-2)]/40",
                  )}
                >
                  <span
                    className={cn(
                      "font-display text-base",
                      isActive ? "text-[color:var(--color-foil)]" : "text-foreground",
                    )}
                  >
                    {f.name}
                  </span>
                  <span className="text-marginalia truncate">{rel}</span>
                  {isActive && (
                    <CornerDownLeft
                      className="ml-auto h-3.5 w-3.5 shrink-0 text-[color:var(--color-foil)]"
                      strokeWidth={1.6}
                    />
                  )}
                </button>
              );
            })
          )}
        </div>

        <div className="border-t border-[color:var(--color-rule-soft)] px-4 py-2">
          <div className="text-marginalia flex items-center gap-4">
            <span><b className="font-normal text-foreground">↑↓</b> navigate</span>
            <span><b className="font-normal text-foreground">↵</b> open</span>
            <span><b className="font-normal text-foreground">esc</b> dismiss</span>
            <span className="ml-auto">Quick Open</span>
          </div>
        </div>
      </div>
    </div>
  );
}
