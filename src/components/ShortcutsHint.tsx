import { useEffect, useRef, useState } from "react";
import { Keyboard } from "lucide-react";
import { cn } from "@/lib/utils";

const SHORTCUTS: { keys: string; description: string }[] = [
  { keys: "⌘ S", description: "Save" },
  { keys: "⌘ P", description: "Quick open" },
  { keys: "⌘ \\", description: "Toggle preview" },
  { keys: "⌘ O", description: "Open a folder" },
];

export function ShortcutsHint() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Click-outside / escape to dismiss.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="no-drag fixed bottom-4 right-4 z-30">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Keyboard shortcuts"
        className={cn(
          "grid h-9 w-9 place-items-center rounded-full border bg-[color:var(--color-surface)]/80 backdrop-blur transition-colors",
          open
            ? "border-[color:var(--color-foil)]/60 text-[color:var(--color-foil)]"
            : "border-[color:var(--color-rule)] text-[color:var(--color-fg-dim)] hover:border-[color:var(--color-foil)]/40 hover:text-foreground",
        )}
      >
        <Keyboard className="h-4 w-4" strokeWidth={1.6} />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Keyboard shortcuts"
          className="absolute bottom-12 right-0 w-72 rounded-xl border border-[color:var(--color-rule)] bg-[color:var(--color-surface-2)]/95 p-4 shadow-[0_30px_70px_-20px_rgba(0,0,0,0.6)] backdrop-blur"
        >
          <div className="text-eyebrow mb-3 text-[color:var(--color-foil)]">
            Keyboard shortcuts
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            {SHORTCUTS.map((s) => (
              <div key={s.keys} className="contents">
                <dt className="font-mono text-[12px] tracking-[0.08em] text-foreground">
                  {s.keys}
                </dt>
                <dd className="font-display italic text-[color:var(--color-fg-2)]">
                  {s.description}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  );
}
