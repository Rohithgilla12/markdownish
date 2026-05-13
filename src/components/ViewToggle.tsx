import { Columns2, FileText, Eye } from "lucide-react";
import { cn } from "@/lib/utils";

export type ViewMode = "editor" | "split" | "preview";

type Props = {
  mode: ViewMode;
  onChange: (mode: ViewMode) => void;
};

const options: { id: ViewMode; label: string; Icon: typeof Columns2 }[] = [
  { id: "editor", label: "Editor", Icon: FileText },
  { id: "split", label: "Split", Icon: Columns2 },
  { id: "preview", label: "Preview", Icon: Eye },
];

export function ViewToggle({ mode, onChange }: Props) {
  return (
    <div className="no-drag inline-flex items-center gap-0.5 rounded-full border border-[color:var(--color-rule)] bg-[color:var(--color-surface)]/60 p-0.5">
      {options.map(({ id, label, Icon }) => (
        <button
          key={id}
          onClick={() => onChange(id)}
          title={label}
          aria-label={label}
          className={cn(
            "inline-flex h-7 w-7 items-center justify-center rounded-full transition-colors",
            mode === id
              ? "bg-[color:var(--color-foil)]/15 text-[color:var(--color-foil)]"
              : "text-[color:var(--color-fg-dim)] hover:text-foreground",
          )}
        >
          <Icon className="h-3.5 w-3.5" strokeWidth={1.6} />
        </button>
      ))}
    </div>
  );
}
