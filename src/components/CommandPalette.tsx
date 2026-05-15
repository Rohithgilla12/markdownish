import { useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { CornerDownLeft, Search } from "lucide-react";
import { cn } from "@/lib/utils";

export type Command = {
  id: string;
  label: string;
  description?: string;
  /** Grouping label rendered above the command. */
  category?: string;
  /** Keyboard shortcut to display (e.g. "⌘ S"). */
  shortcut?: string;
  icon?: ComponentType<{ className?: string; strokeWidth?: number }>;
  /** Keywords that match the filter even if not in the label. */
  keywords?: string[];
  run: () => void | Promise<void>;
};

type Props = {
  commands: Command[];
  onClose: () => void;
};

/**
 * Rank a command against a query. Higher = better match. 0 = no match.
 * Skip-by-2 substring lets "tg" match "toggle". Title-start wins; category
 * match is the weakest signal.
 */
function score(cmd: Command, q: string): number {
  if (!q) return 1;
  const tokens = q.toLowerCase().split(/\s+/).filter(Boolean);
  const haystack = [
    cmd.label,
    cmd.description ?? "",
    cmd.category ?? "",
    ...(cmd.keywords ?? []),
  ]
    .join(" ")
    .toLowerCase();
  const label = cmd.label.toLowerCase();

  let total = 0;
  for (const t of tokens) {
    if (label === t) total += 1000;
    else if (label.startsWith(t)) total += 500;
    else if (label.includes(t)) total += 200;
    else if (haystack.includes(t)) total += 50;
    else return 0;
  }
  return total;
}

export function CommandPalette({ commands, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const results = useMemo(() => {
    const ranked = commands
      .map((c) => ({ c, s: score(c, query.trim()) }))
      .filter((r) => r.s > 0)
      .sort((a, b) => b.s - a.s);
    return ranked.map((r) => r.c).slice(0, 80);
  }, [commands, query]);

  useEffect(() => setCursor(0), [query]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const el = listRef.current?.children[cursor] as HTMLElement | undefined;
    if (el) el.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  function run(cmd: Command) {
    void cmd.run();
    onClose();
  }

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
      if (pick) run(pick);
    }
  }

  // Group by category for display only — the flat `results` array is what
  // navigation operates on, so cross-group arrow nav just works.
  const grouped = useMemo(() => {
    const out: { category: string | null; items: { cmd: Command; index: number }[] }[] = [];
    let current: { category: string | null; items: { cmd: Command; index: number }[] } | null = null;
    results.forEach((cmd, index) => {
      const cat = cmd.category ?? null;
      if (!current || current.category !== cat) {
        current = { category: cat, items: [] };
        out.push(current);
      }
      current.items.push({ cmd, index });
    });
    return out;
  }, [results]);

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-start pt-[14vh]"
      onMouseDown={onClose}
    >
      <div className="absolute inset-0 bg-[color:var(--color-bg)]/75 backdrop-blur-sm" aria-hidden />
      <div
        onMouseDown={(e) => e.stopPropagation()}
        className="relative mx-auto w-[min(680px,92vw)] overflow-hidden rounded-xl border border-[color:var(--color-rule)] bg-[color:var(--color-surface)]/95 shadow-[0_50px_120px_-30px_rgba(0,0,0,0.7)]"
      >
        <div className="flex items-center gap-3 border-b border-[color:var(--color-rule-soft)] px-4 py-3">
          <Search className="h-4 w-4 shrink-0 text-[color:var(--color-foil)]" strokeWidth={1.5} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Run a command…"
            className="w-full bg-transparent font-display text-lg italic text-foreground placeholder:text-[color:var(--color-fg-faint)] focus:outline-none"
          />
          <span className="text-marginalia shrink-0">
            {results.length} / {commands.length}
          </span>
        </div>

        <div ref={listRef} className="max-h-[58vh] overflow-y-auto">
          {results.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <p className="font-display italic text-[color:var(--color-fg-2)]">
                Nothing matches “{query}”.
              </p>
            </div>
          ) : (
            grouped.map((group) => (
              <section key={group.category ?? "_"}>
                {group.category && (
                  <div className="text-eyebrow sticky top-0 z-10 bg-[color:var(--color-surface)]/95 px-5 pt-3 pb-1.5 text-[color:var(--color-foil)] backdrop-blur">
                    {group.category}
                  </div>
                )}
                {group.items.map(({ cmd, index }) => {
                  const isActive = index === cursor;
                  const Icon = cmd.icon;
                  return (
                    <button
                      key={cmd.id}
                      onMouseEnter={() => setCursor(index)}
                      onClick={() => run(cmd)}
                      className={cn(
                        "flex w-full items-center gap-3 px-5 py-2 text-left transition-colors",
                        isActive
                          ? "bg-[color:var(--color-foil)]/[0.10]"
                          : "hover:bg-[color:var(--color-surface-2)]/40",
                      )}
                    >
                      {Icon ? (
                        <Icon
                          className={cn(
                            "h-4 w-4 shrink-0",
                            isActive ? "text-[color:var(--color-foil)]" : "text-[color:var(--color-fg-dim)]",
                          )}
                          strokeWidth={1.6}
                        />
                      ) : (
                        <span className="w-4 shrink-0" aria-hidden />
                      )}
                      <span className="min-w-0 flex-1">
                        <span
                          className={cn(
                            "block truncate font-display text-[15px]",
                            isActive ? "text-[color:var(--color-foil)]" : "text-foreground",
                          )}
                        >
                          {cmd.label}
                        </span>
                        {cmd.description && (
                          <span className="text-marginalia block truncate">{cmd.description}</span>
                        )}
                      </span>
                      {cmd.shortcut && (
                        <span className="text-marginalia shrink-0 font-mono text-[11px] tracking-tight">
                          {cmd.shortcut}
                        </span>
                      )}
                      {isActive && (
                        <CornerDownLeft
                          className="h-3 w-3 shrink-0 text-[color:var(--color-foil)]"
                          strokeWidth={1.8}
                        />
                      )}
                    </button>
                  );
                })}
              </section>
            ))
          )}
        </div>

        <div className="border-t border-[color:var(--color-rule-soft)] px-4 py-2">
          <div className="text-marginalia flex items-center gap-4">
            <span><b className="font-normal text-foreground">↑↓</b> navigate</span>
            <span><b className="font-normal text-foreground">↵</b> run</span>
            <span><b className="font-normal text-foreground">esc</b> dismiss</span>
            <span className="ml-auto">Command palette</span>
          </div>
        </div>
      </div>
    </div>
  );
}
