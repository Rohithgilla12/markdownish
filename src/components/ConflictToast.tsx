import { useEffect, useState } from "react";
import { AlertCircle } from "lucide-react";

type Props = {
  onReload: () => void;
  onKeep: () => void;
};

export function ConflictToast({ onReload, onKeep }: Props) {
  // Tiny entrance — fade + lift, then settle. Honours prefers-reduced-motion.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div
      role="dialog"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-12 z-40 flex justify-center"
    >
      <div
        className="pointer-events-auto flex items-center gap-4 rounded-full border border-[color:var(--color-foil)]/40 bg-[color:var(--color-surface-2)]/95 px-5 py-2.5 shadow-[0_18px_40px_-18px_rgba(0,0,0,0.6)] backdrop-blur"
        style={{
          transform: mounted ? "translateY(0)" : "translateY(-12px)",
          opacity: mounted ? 1 : 0,
          transition: "transform 320ms var(--ease-out-quart), opacity 320ms var(--ease-out-quart)",
        }}
      >
        <AlertCircle className="h-4 w-4 shrink-0 text-[color:var(--color-foil)]" strokeWidth={1.5} />
        <div className="text-sm">
          <span className="font-display italic text-foreground">
            This file changed on disk while you were editing.
          </span>
        </div>
        <div className="ml-2 flex items-center gap-2">
          <button
            onClick={onKeep}
            className="rounded-full px-3 py-1 font-mono text-[11px] tracking-[0.14em] uppercase text-[color:var(--color-fg-dim)] hover:text-foreground"
          >
            Keep mine
          </button>
          <button
            onClick={onReload}
            className="rounded-full bg-[color:var(--color-foil)]/15 px-3 py-1 font-mono text-[11px] tracking-[0.14em] uppercase text-[color:var(--color-foil)] hover:bg-[color:var(--color-foil)]/25"
          >
            Reload
          </button>
        </div>
      </div>
    </div>
  );
}
