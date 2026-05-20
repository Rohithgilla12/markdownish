import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Replace, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useFolderSearch,
  type FileEdit,
  type FileMatches,
  type ReplaceOutcome,
  type Replacement,
} from "@/hooks/useFolderSearch";

type Props = {
  folder: string;
  onSelectMatch: (path: string, offset: number, length: number) => void;
  onClose: () => void;
};

function relativise(folder: string, path: string): string {
  if (!path.startsWith(folder)) return path;
  return path.slice(folder.length).replace(/^[\\/]+/, "");
}

function basename(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

export function FindReplacePanel({ folder, onSelectMatch, onClose }: Props) {
  const { state, query, setQuery, opts, setOpts, refresh, replace } = useFolderSearch(folder);
  const [replacement, setReplacement] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const files: FileMatches[] = state.status === "ready" ? state.result.files : [];
  const errorMsg = state.status === "error" ? state.message : null;

  const totalMatches = useMemo(
    () => files.reduce((acc, f) => acc + f.matches.length, 0),
    [files],
  );

  function toggleFile(path: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  async function applyReplacements(filtered?: { path: string; matchIndex: number }) {
    if (busy) return;
    if (totalMatches === 0) return;

    let edits: FileEdit[];
    if (filtered) {
      const file = files.find((f) => f.path === filtered.path);
      const match = file?.matches[filtered.matchIndex];
      if (!file || !match) return;
      edits = [
        {
          path: file.path,
          expectedMtime: file.mtime,
          replacements: [
            { offset: match.offset, length: match.length, text: replacement },
          ],
        },
      ];
    } else {
      const visibleCount = files.length;
      const ok = window.confirm(
        `Replace ${totalMatches} match${totalMatches === 1 ? "" : "es"} across ${visibleCount} file${visibleCount === 1 ? "" : "s"}?`,
      );
      if (!ok) return;
      edits = files.map((f) => ({
        path: f.path,
        expectedMtime: f.mtime,
        replacements: [...f.matches]
          .sort((a, b) => b.offset - a.offset)
          .map<Replacement>((m) => ({
            offset: m.offset,
            length: m.length,
            text: replacement,
          })),
      }));
    }

    setBusy(true);
    try {
      const outcomes = await replace(edits);
      const ok = outcomes.filter((o): o is Extract<ReplaceOutcome, { kind: "ok" }> => o.kind === "ok");
      const stale = outcomes.filter((o) => o.kind === "staleMtime");
      const ioErr = outcomes.filter((o) => o.kind === "ioError");
      const replacedCount = ok.reduce((acc, o) => acc + o.replaced, 0);

      const msgParts: string[] = [];
      if (replacedCount > 0) {
        msgParts.push(`Replaced ${replacedCount} in ${ok.length} file${ok.length === 1 ? "" : "s"}.`);
      }
      if (stale.length > 0) {
        msgParts.push(`${stale.length} file${stale.length === 1 ? "" : "s"} changed since search — refresh.`);
      }
      if (ioErr.length > 0) {
        msgParts.push(`${ioErr.length} file${ioErr.length === 1 ? "" : "s"} failed.`);
      }
      setNotice(msgParts.join(" ") || "Nothing to do.");
      refresh();
    } finally {
      setBusy(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void applyReplacements();
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-start pt-[10vh]" onMouseDown={onClose}>
      <div
        className="absolute inset-0 bg-[color:var(--color-bg)]/75 backdrop-blur-sm"
        aria-hidden
      />
      <div
        onMouseDown={(e) => e.stopPropagation()}
        className="relative mx-auto w-[min(820px,94vw)] overflow-hidden rounded-xl border border-[color:var(--color-rule)] bg-[color:var(--color-surface)]/95 shadow-[0_50px_120px_-30px_rgba(0,0,0,0.7)]"
      >
        {/* Query row */}
        <div className="flex items-center gap-3 border-b border-[color:var(--color-rule-soft)] px-4 py-3">
          <Search className="h-4 w-4 shrink-0 text-[color:var(--color-foil)]" strokeWidth={1.5} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Find in folder…"
            className="w-full bg-transparent font-display text-lg italic text-foreground placeholder:text-[color:var(--color-fg-faint)] focus:outline-none"
          />
          <div className="flex shrink-0 items-center gap-1">
            <Toggle
              label="Aa"
              active={opts.caseSensitive}
              onClick={() => setOpts({ ...opts, caseSensitive: !opts.caseSensitive })}
            />
            <Toggle
              label=".*"
              active={opts.regex}
              onClick={() => setOpts({ ...opts, regex: !opts.regex })}
            />
            <Toggle
              label="\b"
              active={opts.wholeWord}
              onClick={() => setOpts({ ...opts, wholeWord: !opts.wholeWord })}
            />
          </div>
        </div>

        {/* Replace row */}
        <div className="flex items-center gap-3 border-b border-[color:var(--color-rule-soft)] px-4 py-3">
          <Replace className="h-4 w-4 shrink-0 text-[color:var(--color-fg-dim)]" strokeWidth={1.5} />
          <input
            value={replacement}
            onChange={(e) => setReplacement(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Replace with…"
            className="w-full bg-transparent font-display text-base italic text-foreground placeholder:text-[color:var(--color-fg-faint)] focus:outline-none"
          />
          <button
            disabled={busy || totalMatches === 0}
            onClick={() => void applyReplacements()}
            className={cn(
              "rounded-full px-3 py-1 font-mono text-[11px] tracking-[0.14em] uppercase",
              busy || totalMatches === 0
                ? "bg-[color:var(--color-surface-2)]/40 text-[color:var(--color-fg-faint)]"
                : "bg-[color:var(--color-foil)]/15 text-[color:var(--color-foil)] hover:bg-[color:var(--color-foil)]/25",
            )}
          >
            Replace all
          </button>
        </div>

        {/* Notice / error */}
        {(errorMsg || notice) && (
          <div className="border-b border-[color:var(--color-rule-soft)] px-4 py-2 text-marginalia text-[color:var(--color-foil)]">
            {errorMsg ?? notice}
          </div>
        )}

        {/* Results */}
        <div className="max-h-[55vh] overflow-y-auto">
          {state.status === "loading" && (
            <div className="px-5 py-8 text-center text-marginalia">Searching…</div>
          )}
          {state.status === "idle" && (
            <div className="px-5 py-10 text-center font-display italic text-[color:var(--color-fg-2)]">
              Type to search this folder.
            </div>
          )}
          {state.status === "ready" && files.length === 0 && (
            <div className="px-5 py-10 text-center font-display italic text-[color:var(--color-fg-2)]">
              No matches for “{state.query}”.
            </div>
          )}
          {files.map((f) => {
            const isCollapsed = collapsed.has(f.path);
            return (
              <div key={f.path} className="border-b border-[color:var(--color-rule-soft)] last:border-b-0">
                <button
                  onClick={() => toggleFile(f.path)}
                  className="flex w-full items-center gap-2 px-4 py-2 text-left hover:bg-[color:var(--color-surface-2)]/30"
                >
                  {isCollapsed ? (
                    <ChevronRight className="h-3.5 w-3.5 text-[color:var(--color-fg-dim)]" strokeWidth={1.6} />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5 text-[color:var(--color-fg-dim)]" strokeWidth={1.6} />
                  )}
                  <span className="font-display text-base text-foreground">{basename(f.path)}</span>
                  <span className="text-marginalia truncate">{relativise(folder, f.path)}</span>
                  <span className="ml-auto text-marginalia">
                    {f.matches.length}
                    {f.truncated ? "+" : ""} match{f.matches.length === 1 ? "" : "es"}
                  </span>
                </button>
                {!isCollapsed && (
                  <div>
                    {f.matches.map((m, i) => (
                      <div
                        key={`${f.path}:${m.offset}`}
                        className="flex items-center gap-3 px-4 py-1.5 hover:bg-[color:var(--color-surface-2)]/30"
                      >
                        <button
                          onClick={() => {
                            onSelectMatch(f.path, m.offset, m.length);
                            onClose();
                          }}
                          className="flex flex-1 items-center gap-3 text-left"
                        >
                          <span className="font-mono text-marginalia w-10 shrink-0 text-right text-[color:var(--color-fg-dim)]">
                            {m.line}
                          </span>
                          <span className="font-mono text-[12.5px] text-[color:var(--color-fg-2)]">
                            {m.snippet.slice(0, m.snippetMatchStart)}
                            <mark className="bg-[color:var(--color-foil)]/30 text-foreground">
                              {m.snippet.slice(m.snippetMatchStart, m.snippetMatchEnd)}
                            </mark>
                            {m.snippet.slice(m.snippetMatchEnd)}
                          </span>
                        </button>
                        <button
                          disabled={busy}
                          onClick={() =>
                            void applyReplacements({ path: f.path, matchIndex: i })
                          }
                          className="rounded-full px-2 py-0.5 font-mono text-[10px] tracking-[0.14em] uppercase text-[color:var(--color-fg-dim)] hover:bg-[color:var(--color-foil)]/15 hover:text-[color:var(--color-foil)]"
                        >
                          Replace
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {state.status === "ready" && state.result.truncatedFiles && (
            <div className="px-5 py-3 text-center text-marginalia">
              Only showing the first {files.length} files with matches.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-[color:var(--color-rule-soft)] px-4 py-2">
          <div className="text-marginalia flex items-center gap-4">
            <span>
              <b className="font-normal text-foreground">⌘↵</b> replace all
            </span>
            <span>
              <b className="font-normal text-foreground">esc</b> dismiss
            </span>
            <span className="ml-auto">Find &amp; Replace</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function Toggle({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-md px-2 py-1 font-mono text-[11px] tracking-[0.14em] uppercase",
        active
          ? "bg-[color:var(--color-foil)]/15 text-[color:var(--color-foil)]"
          : "text-[color:var(--color-fg-dim)] hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}
