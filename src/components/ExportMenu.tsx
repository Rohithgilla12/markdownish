import { useEffect, useRef, useState } from "react";
import { Download, FileCode, FileText, Image, BookMarked } from "lucide-react";
import type { ExportFormat } from "@/lib/export";
import { cn } from "@/lib/utils";

type Props = {
  onExport: (format: ExportFormat) => void;
  busy: ExportFormat | null;
};

const ITEMS: { format: ExportFormat; label: string; hint: string; icon: typeof FileText }[] = [
  { format: "pdf", label: "PDF", hint: "via print", icon: FileText },
  { format: "html", label: "HTML", hint: "standalone", icon: FileCode },
  { format: "png", label: "PNG", hint: "preview image", icon: Image },
  { format: "epub", label: "EPUB", hint: "e-reader", icon: BookMarked },
];

/** Status-bar export control: a small upward dropdown of the four formats. */
export function ExportMenu({ onExport, busy }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex items-center gap-1.5 rounded px-1.5 py-0.5 transition-colors",
          open ? "text-foreground" : "text-[color:var(--color-fg-faint)] hover:text-foreground",
        )}
        title="Export document"
      >
        <Download className="h-3 w-3" strokeWidth={1.8} />
        <span>Export</span>
      </button>

      {open && (
        <div className="absolute bottom-[calc(100%+6px)] right-0 z-40 w-44 overflow-hidden rounded-md border border-[color:var(--color-rule)] bg-[color:var(--color-surface)] py-1 shadow-xl">
          {ITEMS.map(({ format, label, hint, icon: Icon }) => (
            <button
              key={format}
              disabled={busy !== null}
              onClick={() => {
                setOpen(false);
                onExport(format);
              }}
              className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[12.5px] text-[color:var(--color-fg-dim)] transition-colors hover:bg-[color:var(--color-surface-2)] hover:text-foreground disabled:opacity-50"
            >
              <Icon className="h-3.5 w-3.5 text-[color:var(--color-foil)]" strokeWidth={1.8} />
              <span className="flex-1 text-foreground">{label}</span>
              <span className="font-mono text-[10px] text-[color:var(--color-fg-faint)]">
                {busy === format ? "…" : hint}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
