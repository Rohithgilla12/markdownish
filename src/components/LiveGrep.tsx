import { useEffect, useMemo, useRef, useState } from "react";
import { CornerDownLeft, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { useFolderSearch, type SearchMatch, type SearchResult } from "@/hooks/useFolderSearch";

type Props = {
  folder: string;
  onSelect: (path: string, offset: number, length: number) => void;
  onClose: () => void;
};

type Row = { path: string; match: SearchMatch };

/** Hard cap on rendered rows — the backend already caps per-file matches. */
const MAX_ROWS = 200;

function relativise(folder: string, path: string): string {
  if (!path.startsWith(folder)) return path;
  return path.slice(folder.length).replace(/^[\\/]+/, "");
}

function flatten(result: SearchResult): Row[] {
  const out: Row[] = [];
  for (const f of result.files) {
    for (const m of f.matches) {
      out.push({ path: f.path, match: m });
      if (out.length >= MAX_ROWS) return out;
    }
  }
  return out;
}

/**
 * Telescope-style live grep: type → folder-wide content search as you type,
 * Enter jumps to the match. Search itself is `useFolderSearch` (same backend
 * as Find & Replace); this overlay is just a flat, keyboard-first result list.
 */
export function LiveGrep({ folder, onSelect, onClose }: Props) {
  const { state, query, setQuery } = useFolderSearch(folder);
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  // Keep the previous result on screen while the next keystroke's search is
  // in flight — clearing on every "loading" tick makes the list strobe.
  const [rows, setRows] = useState<Row[]>([]);
  useEffect(() => {
    if (state.status === "ready") setRows(flatten(state.result));
    else if (state.status === "idle") setRows([]);
  }, [state]);

  useEffect(() => setCursor(0), [query]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const el = listRef.current?.children[cursor] as HTMLElement | undefined;
    el?.scrollIntoView?.({ block: "nearest" });
  }, [cursor]);

  function pick(row: Row) {
    onSelect(row.path, row.match.offset, row.match.length);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    const down = e.key === "ArrowDown" || (e.ctrlKey && e.key.toLowerCase() === "n");
    const up = e.key === "ArrowUp" || (e.ctrlKey && e.key.toLowerCase() === "p");
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (down) {
      e.preventDefault();
      setCursor((c) => Math.min(c + 1, rows.length - 1));
    } else if (up) {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const row = rows[cursor];
      if (row) pick(row);
    }
  }

  const total = useMemo(
    () => (state.status === "ready" ? state.result.files.reduce((n, f) => n + f.matches.length, 0) : rows.length),
    [state, rows],
  );

  return (
    <div className="fixed inset-0 z-50 grid place-items-start pt-[14vh]" onMouseDown={onClose}>
      <div className="absolute inset-0 bg-[color:var(--color-bg)]/75 backdrop-blur-sm" aria-hidden />
      <div
        onMouseDown={(e) => e.stopPropagation()}
        className="relative mx-auto w-[min(720px,92vw)] overflow-hidden rounded-xl border border-[color:var(--color-rule)] bg-[color:var(--color-surface)]/95 shadow-[0_50px_120px_-30px_rgba(0,0,0,0.7)]"
      >
        <div className="flex items-center gap-3 border-b border-[color:var(--color-rule-soft)] px-4 py-3">
          <Search className="h-4 w-4 shrink-0 text-[color:var(--color-foil)]" strokeWidth={1.5} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search in files…"
            className="w-full bg-transparent font-display text-lg italic text-foreground placeholder:text-[color:var(--color-fg-faint)] focus:outline-none"
          />
          <span className="text-marginalia shrink-0">
            {query.trim() ? `${total} match${total === 1 ? "" : "es"}` : ""}
          </span>
        </div>

        <div ref={listRef} className="max-h-[58vh] overflow-y-auto">
          {rows.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <p className="font-display italic text-[color:var(--color-fg-2)]">
                {!query.trim()
                  ? "Type to grep this folder."
                  : state.status === "loading"
                    ? "Searching…"
                    : state.status === "error"
                      ? state.message
                      : `Nothing matches “${query}”.`}
              </p>
            </div>
          ) : (
            rows.map((row, index) => {
              const isActive = index === cursor;
              const m = row.match;
              return (
                <button
                  key={`${row.path}:${m.offset}`}
                  onMouseEnter={() => setCursor(index)}
                  onClick={() => pick(row)}
                  className={cn(
                    "flex w-full items-baseline gap-3 px-5 py-1.5 text-left transition-colors",
                    isActive
                      ? "bg-[color:var(--color-foil)]/[0.10]"
                      : "hover:bg-[color:var(--color-surface-2)]/40",
                  )}
                >
                  <span className="min-w-0 flex-1 truncate font-mono text-[13px] text-foreground">
                    {m.snippet.slice(0, m.snippetMatchStart)}
                    <mark className="rounded-[2px] bg-[color:var(--color-foil)]/25 text-[color:var(--color-foil)]">
                      {m.snippet.slice(m.snippetMatchStart, m.snippetMatchEnd)}
                    </mark>
                    {m.snippet.slice(m.snippetMatchEnd)}
                  </span>
                  <span className="text-marginalia shrink-0 max-w-[40%] truncate">
                    {relativise(folder, row.path)}
                  </span>
                  <span
                    className={cn(
                      "shrink-0 font-mono text-[11px]",
                      isActive ? "text-[color:var(--color-foil)]" : "text-[color:var(--color-fg-dim)]",
                    )}
                  >
                    :{m.line}
                  </span>
                  {isActive && (
                    <CornerDownLeft
                      className="h-3 w-3 shrink-0 self-center text-[color:var(--color-foil)]"
                      strokeWidth={1.8}
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
            <span><b className="font-normal text-foreground">↵</b> jump to match</span>
            <span><b className="font-normal text-foreground">esc</b> dismiss</span>
            <span className="ml-auto">Live grep</span>
          </div>
        </div>
      </div>
    </div>
  );
}
