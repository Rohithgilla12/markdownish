import { useEffect, useRef, useState } from "react";
import { Type } from "lucide-react";
import {
  FAMILIES,
  FAMILY_ORDER,
  MEASURES,
  MEASURE_ORDER,
  SCALES,
  SCALE_ORDER,
  type ReaderPrefs,
} from "@/lib/reader";
import { cn } from "@/lib/utils";

type Props = {
  prefs: ReaderPrefs;
  onChange: (patch: Partial<ReaderPrefs>) => void;
  onReset: () => void;
  /**
   * Show the keyboard shortcuts. Only reading mode binds them — in the split
   * view those keys belong to the editor — so the hint is opt-in.
   */
  keyHints?: boolean;
};

/** One row of mutually-exclusive segmented options. */
function Segmented<T extends string>({
  label,
  order,
  meta,
  current,
  onPick,
}: {
  label: string;
  order: T[];
  meta: Record<T, { label: string }>;
  current: T;
  onPick: (v: T) => void;
}) {
  return (
    <div>
      <div className="text-eyebrow mb-1.5 text-[10px]">{label}</div>
      <div className="flex gap-1 rounded-md border border-[color:var(--color-rule-soft)] p-0.5">
        {order.map((key) => {
          const isActive = key === current;
          return (
            <button
              key={key}
              onClick={() => onPick(key)}
              aria-pressed={isActive}
              className={cn(
                "flex-1 rounded-[4px] px-2 py-1 font-mono text-[11px] transition-colors",
                isActive
                  ? "bg-[color:var(--color-foil)]/[0.14] text-[color:var(--color-foil)]"
                  : "text-[color:var(--color-fg-dim)] hover:text-foreground",
              )}
            >
              {meta[key].label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Reading-mode typography controls: a small trigger that opens a popover with
 * column width, text size, and body font. Everything writes straight through
 * to `useReaderPrefs`, so changes are live and persisted — there's no apply
 * step and nothing to cancel.
 *
 * In reading mode the same values are also on the keyboard (`−`/`+` for size,
 * `[`/`]` for width), so this panel is the discoverable surface rather than
 * the only one.
 */
export function ReaderControls({ prefs, onChange, onReset, keyHints = false }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Reading typography"
        aria-expanded={open}
        title="Reading typography"
        className={cn(
          "inline-flex items-center gap-2 rounded-full border px-3 py-1.5",
          "font-mono text-[10.5px] uppercase tracking-[0.16em] transition-colors",
          open
            ? "border-[color:var(--color-foil-dim)] text-[color:var(--color-foil)]"
            : "border-[color:var(--color-rule)] text-[color:var(--color-fg-dim)] hover:text-foreground",
        )}
      >
        <Type className="h-3 w-3" strokeWidth={1.8} />
        <span>Aa</span>
      </button>

      {open && (
        <div
          className={cn(
            "absolute right-0 top-[calc(100%+8px)] z-40 w-64 space-y-3.5 rounded-lg p-3.5",
            "border border-[color:var(--color-rule)] bg-[color:var(--color-surface)]/95 backdrop-blur",
            "shadow-[0_16px_40px_-12px_rgba(0,0,0,0.5)]",
          )}
        >
          <Segmented
            label="Width"
            order={MEASURE_ORDER}
            meta={MEASURES}
            current={prefs.measure}
            onPick={(measure) => onChange({ measure })}
          />
          <Segmented
            label="Size"
            order={SCALE_ORDER}
            meta={SCALES}
            current={prefs.scale}
            onPick={(scale) => onChange({ scale })}
          />
          <Segmented
            label="Body font"
            order={FAMILY_ORDER}
            meta={FAMILIES}
            current={prefs.family}
            onPick={(family) => onChange({ family })}
          />
          <div className="flex items-end justify-between gap-3 border-t border-[color:var(--color-rule-soft)] pt-2.5">
            {keyHints ? (
              <div className="text-marginalia space-y-0.5 text-[10px] leading-[1.5]">
                <div>− + size · [ ] width</div>
                <div>j k scroll · g G ends</div>
              </div>
            ) : (
              <span className="text-marginalia text-[10px]">Shared with reading mode</span>
            )}
            <button
              onClick={onReset}
              className="shrink-0 font-mono text-[10.5px] text-[color:var(--color-fg-dim)] underline decoration-[color:var(--color-rule)] underline-offset-2 transition-colors hover:text-[color:var(--color-foil)]"
            >
              Reset
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
