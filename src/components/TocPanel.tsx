import { useEffect, useState } from "react";
import { X } from "lucide-react";
import type { Heading } from "@/lib/outline";
import { cn } from "@/lib/utils";

type Props = {
  headings: Heading[];
  /** The preview scroll container, when the preview pane is visible. */
  previewEl: HTMLElement | null;
  /** Scroll the editor to a body line — used when the preview isn't shown. */
  onJumpToLine: (line: number) => void;
  onClose: () => void;
};

/**
 * Docked outline panel for the split view (distinct from Reading Mode's
 * floating gutter). Lists every heading; the active one — the closest heading
 * above the scroll trigger line in the preview — is rendered in foil.
 *
 * Clicking an entry smooth-scrolls the preview to that heading's anchor. With
 * the preview hidden (editor-only) it scrolls the editor to the source line
 * instead, so the outline stays useful in every view mode.
 */
export function TocPanel({ headings, previewEl, onJumpToLine, onClose }: Props) {
  const [activeId, setActiveId] = useState<string | null>(null);

  // Scroll-spy against the preview. Manual "closest heading above the trigger
  // line" rather than IntersectionObserver — predictable, and it matches the
  // Reading Mode outline's behaviour.
  useEffect(() => {
    if (!previewEl) {
      setActiveId(null);
      return;
    }
    function update() {
      const root = previewEl;
      if (!root) return;
      const triggerY = root.getBoundingClientRect().top + 120;
      const els = root.querySelectorAll<HTMLElement>(".prose :is(h1,h2,h3,h4,h5,h6)");
      let active: string | null = null;
      for (const el of els) {
        if (!el.id) continue;
        if (el.getBoundingClientRect().top <= triggerY) active = el.id;
        else break;
      }
      setActiveId(active);
    }
    previewEl.addEventListener("scroll", update, { passive: true });
    update();
    return () => previewEl.removeEventListener("scroll", update);
  }, [previewEl, headings]);

  function jump(h: Heading) {
    if (previewEl) {
      const el = previewEl.querySelector<HTMLElement>(`[id="${CSS.escape(h.id)}"]`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
    }
    onJumpToLine(h.line);
  }

  return (
    <aside className="flex h-full min-h-0 w-64 flex-col border-l border-[color:var(--color-rule-soft)] bg-[color:var(--color-bg)]">
      <header className="flex items-center justify-between px-4 pt-4 pb-2">
        <span className="text-eyebrow text-[color:var(--color-foil)]">Outline</span>
        <button
          onClick={onClose}
          aria-label="Hide outline"
          className="text-[color:var(--color-fg-faint)] transition-colors hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" strokeWidth={1.8} />
        </button>
      </header>

      {headings.length === 0 ? (
        <p className="px-4 py-2 font-mono text-[11px] text-[color:var(--color-fg-faint)]">
          No headings yet.
        </p>
      ) : (
        <ol className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
          {headings.map((h, i) => {
            const isActive = h.id === activeId;
            return (
              <li key={`${h.id}-${i}`}>
                <button
                  onClick={() => jump(h)}
                  style={{ paddingLeft: `${8 + (h.level - 1) * 12}px` }}
                  title={h.text}
                  className={cn(
                    "block w-full truncate rounded py-1 pr-2 text-left text-[12.5px] leading-[1.5] transition-colors",
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
      )}
    </aside>
  );
}
