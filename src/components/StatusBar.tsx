import type { ReactNode } from "react";
import type { DocStats } from "@/lib/stats";

type Props = {
  stats: DocStats;
  /** Right-aligned controls (outline toggle, export, …). */
  children?: ReactNode;
};

const nf = new Intl.NumberFormat();

/**
 * The thin status strip under the editor/preview. Document statistics on the
 * left (word count, reading time, paragraphs), action controls on the right.
 * Mono, faint, tabular — it sits quietly and never competes with the prose.
 */
export function StatusBar({ stats, children }: Props) {
  return (
    <footer className="flex h-7 shrink-0 items-center justify-between border-t border-[color:var(--color-rule-soft)] bg-[color:var(--color-bg)] px-4 font-mono text-[10.5px] tracking-[0.04em] text-[color:var(--color-fg-faint)] tabular-nums">
      <div className="flex items-center gap-3">
        <span>{nf.format(stats.words)} words</span>
        <span aria-hidden className="text-[color:var(--color-rule)]">·</span>
        <span>{stats.readingMinutes} min read</span>
        <span aria-hidden className="text-[color:var(--color-rule)]">·</span>
        <span>
          {nf.format(stats.paragraphs)} {stats.paragraphs === 1 ? "paragraph" : "paragraphs"}
        </span>
      </div>
      {children && <div className="flex items-center gap-1.5">{children}</div>}
    </footer>
  );
}
