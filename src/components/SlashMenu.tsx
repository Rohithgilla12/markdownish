import { useEffect } from "react";
import { CornerDownLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Snippet } from "@/lib/snippets";

type Props = {
  snippets: Snippet[];
  cursor: number;
  /** Page-relative coordinates where the menu should anchor (top-left of the menu). */
  anchor: { top: number; left: number };
  onPick: (snippet: Snippet) => void;
  onCursor: (i: number) => void;
};

/**
 * Small popover floated next to the textarea caret. Renders the filtered
 * snippet list in a foil-tinted card; arrow-key nav is owned by the Editor
 * (it intercepts keydown before the textarea), this component just paints.
 */
export function SlashMenu({ snippets, cursor, anchor, onPick, onCursor }: Props) {
  // Keep the highlighted row in view if the list grows past its max height.
  useEffect(() => {
    const el = document.getElementById(`slash-item-${cursor}`);
    if (el) el.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  return (
    <div
      role="listbox"
      className="fixed z-40 w-[280px] overflow-hidden rounded-lg border border-[color:var(--color-rule)] bg-[color:var(--color-surface-2)]/95 shadow-[0_24px_50px_-20px_rgba(0,0,0,0.6)] backdrop-blur"
      style={{ top: anchor.top, left: anchor.left }}
    >
      <div className="border-b border-[color:var(--color-rule-soft)] px-3 py-1.5">
        <div className="text-marginalia">
          / · {snippets.length} {snippets.length === 1 ? "snippet" : "snippets"}
        </div>
      </div>
      <ol className="max-h-[260px] overflow-y-auto py-1">
        {snippets.map((s, i) => {
          const active = i === cursor;
          return (
            <li key={s.trigger} id={`slash-item-${i}`}>
              <button
                role="option"
                aria-selected={active}
                onMouseEnter={() => onCursor(i)}
                onMouseDown={(e) => {
                  // Use mousedown — onClick fires after the textarea regains
                  // focus and our keystroke flow doesn't expect that.
                  e.preventDefault();
                  onPick(s);
                }}
                className={cn(
                  "flex w-full items-center gap-3 px-3 py-1.5 text-left transition-colors",
                  active
                    ? "bg-[color:var(--color-foil)]/[0.12]"
                    : "hover:bg-[color:var(--color-surface-3)]/40",
                )}
              >
                <span
                  className={cn(
                    "min-w-[3.5rem] font-mono text-[12px] tracking-tight",
                    active ? "text-[color:var(--color-foil)]" : "text-[color:var(--color-fg-dim)]",
                  )}
                >
                  /{s.trigger}
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      "block truncate text-[13px]",
                      active ? "text-foreground" : "text-[color:var(--color-fg-2)]",
                    )}
                  >
                    {s.label}
                  </span>
                  {s.description && (
                    <span className="text-marginalia block truncate">{s.description}</span>
                  )}
                </span>
                {active && (
                  <CornerDownLeft
                    className="ml-1 h-3 w-3 shrink-0 text-[color:var(--color-foil)]"
                    strokeWidth={1.8}
                  />
                )}
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
