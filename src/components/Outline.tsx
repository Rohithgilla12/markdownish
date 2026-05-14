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
};

/**
 * The right-side outline gutter for Reading Mode.
 *
 * Each H1/H2/H3 in the rendered prose gets an entry; the active one (closest
 * heading above the scroll-trigger line) is rendered in foil, with a foil pip
 * replacing the rule-soft left border for that row.
 *
 * Hidden below 1024px (Tailwind's `lg`) — the layout doesn't have room for it
 * once the prose column needs the whole viewport.
 */
export function Outline({ headings, activeId, onJump }: Props) {
  if (headings.length === 0) return null;

  return (
    <nav
      aria-label="Outline"
      className="hidden lg:block fixed right-8 top-1/2 z-20 -translate-y-1/2"
    >
      <div className="text-eyebrow mb-3 text-[color:var(--color-foil)]">— Outline —</div>
      <ol className="relative flex max-h-[60vh] w-56 flex-col overflow-y-auto border-l border-[color:var(--color-rule-soft)] pl-4">
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
                  "block w-full truncate text-left text-[12.5px] leading-[1.55] py-1 transition-colors",
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
    </nav>
  );
}
