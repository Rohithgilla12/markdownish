import { cn } from "@/lib/utils";

export type OutlineHeading = {
  id: string;
  level: number;
  text: string;
};

type Props = {
  headings: OutlineHeading[];
  activeId: string | null;
  onJump: (id: string) => void;
  /** Visibility classes from `RAIL_CLASS` — depends on the chosen measure. */
  className?: string;
};

/**
 * The right-side outline rail for Reading Mode.
 *
 * Each H1/H2/H3 in the rendered prose gets an entry; the active one (closest
 * heading above the scroll-trigger line) is rendered in foil, with a foil pip
 * replacing the rule-soft left border for that row.
 *
 * In-flow and sticky rather than `position: fixed`. Fixed positioning meant the
 * rail floated over the prose, which was survivable at the old fixed column
 * width but collides as soon as the reader picks a wider measure — so it is now
 * a flex sibling of the prose, with a mirror spacer opposite it keeping the text
 * window-centred.
 *
 * Whether it shows at all is the caller's call, via `className` — see
 * `RAIL_CLASS` in lib/reader.ts. A narrow window, or a reader who has asked for
 * a wide column, doesn't have room to spare for it.
 */
export function Outline({ headings, activeId, onJump, className }: Props) {
  if (headings.length === 0) return null;

  return (
    <nav
      aria-label="Outline"
      className={cn("w-60 shrink-0", className ?? "hidden lg:block")}
    >
      <div className="sticky top-32 pt-16">
        <div className="text-eyebrow mb-3 text-[color:var(--color-foil)]">— Outline —</div>
        <ol className="relative flex max-h-[calc(100vh-16rem)] flex-col overflow-y-auto border-l border-[color:var(--color-rule-soft)] pl-4">
          {headings.map((h) => {
            const isActive = h.id === activeId;
            return (
              <li key={h.id} className="relative">
                {isActive && (
                  <span
                    aria-hidden
                    className="absolute -left-4 top-1/2 h-3 w-px -translate-y-1/2 bg-[color:var(--color-foil)]"
                  />
                )}
                <button
                  onClick={() => onJump(h.id)}
                  style={{ paddingLeft: `${(h.level - 1) * 14}px` }}
                  title={h.text}
                  className={cn(
                    "block w-full truncate py-1 text-left text-[12.5px] leading-[1.55] transition-colors",
                    isActive
                      ? "text-[color:var(--color-foil)]"
                      : "text-[color:var(--color-fg-dim)] hover:text-foreground",
                  )}
                >
                  {h.text}
                </button>
              </li>
            );
          })}
        </ol>
      </div>
    </nav>
  );
}
