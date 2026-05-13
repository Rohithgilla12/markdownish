import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Tab } from "@/hooks/useTabs";

type Props = {
  tabs: Tab[];
  activeIndex: number;
  onActivate: (index: number) => void;
  onClose: (path: string) => void;
};

function basename(p: string) {
  return p.split(/[\\/]/).filter(Boolean).pop() ?? p;
}

export function TabBar({ tabs, activeIndex, onActivate, onClose }: Props) {
  if (tabs.length === 0) return null;

  return (
    <div
      role="tablist"
      className="drag flex h-10 shrink-0 items-stretch gap-px overflow-x-auto border-b border-[color:var(--color-rule-soft)] bg-[color:var(--color-bg)]/40 pl-3 pr-32"
    >
      {tabs.map((tab, i) => {
        const isActive = i === activeIndex;
        const isDirty = tab.content !== tab.original;
        const name = basename(tab.path);

        return (
          <div
            key={tab.path}
            role="tab"
            aria-selected={isActive}
            className={cn(
              "no-drag group relative flex items-center gap-2 px-3.5",
              isActive
                ? "text-[color:var(--color-foil)]"
                : "text-[color:var(--color-fg-dim)] hover:text-foreground",
            )}
          >
            <button
              onClick={() => onActivate(i)}
              onAuxClick={(e) => {
                // Middle-click closes — borrowed from every tab bar ever.
                if (e.button === 1) {
                  e.preventDefault();
                  onClose(tab.path);
                }
              }}
              className="flex items-center gap-2 py-2"
              title={tab.path}
            >
              <span className="max-w-[180px] truncate font-display text-[15px] italic">
                {name}
              </span>
              {isDirty && (
                <span
                  aria-label="unsaved"
                  className="h-1.5 w-1.5 shrink-0 rounded-full bg-[color:var(--color-foil)]"
                />
              )}
            </button>

            <button
              onClick={(e) => {
                e.stopPropagation();
                onClose(tab.path);
              }}
              aria-label={`Close ${name}`}
              className={cn(
                "grid h-5 w-5 place-items-center rounded transition-[opacity,background-color]",
                "hover:bg-[color:var(--color-surface-2)] hover:text-foreground",
                isActive
                  ? "opacity-60 hover:opacity-100"
                  : "opacity-0 group-hover:opacity-100",
              )}
            >
              <X className="h-3 w-3" strokeWidth={2} />
            </button>

            {/* Active underline — sits flush on the bottom border of the bar */}
            <span
              aria-hidden
              className={cn(
                "pointer-events-none absolute inset-x-2 bottom-[-1px] h-px",
                isActive ? "bg-[color:var(--color-foil)]" : "bg-transparent",
              )}
            />
          </div>
        );
      })}
    </div>
  );
}
