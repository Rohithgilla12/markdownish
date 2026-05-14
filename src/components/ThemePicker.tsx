import { useEffect, useRef, useState } from "react";
import { Check, CornerDownLeft, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { THEMES, type ThemeId, type ThemeMeta } from "@/lib/themes";

type Props = {
  currentTheme: ThemeId;
  onPreview: (id: ThemeId) => void;
  onCommit: (id: ThemeId) => void;
  onRevert: () => void;
  onClose: () => void;
};

/**
 * Theme picker with live preview.
 *
 *  - Arrow keys navigate the list; each move previews the highlighted theme
 *    on the whole window in real time
 *  - Enter commits the highlighted theme and closes
 *  - Escape (or clicking the backdrop) reverts to the previously committed
 *    theme and closes
 *  - Hovering a row also previews — letting you compare without keyboard
 */
export function ThemePicker({
  currentTheme,
  onPreview,
  onCommit,
  onRevert,
  onClose,
}: Props) {
  const initialIndex = Math.max(
    0,
    THEMES.findIndex((t) => t.id === currentTheme),
  );
  const [cursor, setCursor] = useState(initialIndex);
  const listRef = useRef<HTMLDivElement | null>(null);

  function close(commit: boolean) {
    if (commit) {
      onCommit(THEMES[cursor].id);
    } else {
      onRevert();
    }
    onClose();
  }

  // Apply preview as cursor moves. Skip the initial render so we don't
  // re-paint the already-correct theme.
  const isFirst = useRef(true);
  useEffect(() => {
    if (isFirst.current) {
      isFirst.current = false;
      return;
    }
    onPreview(THEMES[cursor].id);
  }, [cursor, onPreview]);

  // Keep selected row visible.
  useEffect(() => {
    const el = listRef.current?.children[cursor] as HTMLElement | undefined;
    if (el) el.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  function onKey(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      close(false);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => Math.min(c + 1, THEMES.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      close(true);
    }
  }

  // Autofocus the dialog so keyboard works without a click first.
  const rootRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    rootRef.current?.focus();
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-start pt-[14vh]"
      onMouseDown={() => close(false)}
    >
      <div
        className="absolute inset-0 bg-[color:var(--color-bg)]/75 backdrop-blur-sm"
        aria-hidden
      />
      <div
        ref={rootRef}
        tabIndex={-1}
        role="dialog"
        aria-label="Theme picker"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={onKey}
        className="relative mx-auto w-[min(540px,92vw)] overflow-hidden rounded-xl border border-[color:var(--color-rule)] bg-[color:var(--color-surface)]/95 shadow-[0_50px_120px_-30px_rgba(0,0,0,0.7)] focus:outline-none"
      >
        <header className="flex items-center gap-3 border-b border-[color:var(--color-rule-soft)] px-5 py-3">
          <span className="text-eyebrow text-[color:var(--color-foil)]">— Theme —</span>
          <span className="ml-auto text-marginalia">
            {THEMES.length} options
          </span>
        </header>

        <div ref={listRef} className="max-h-[60vh] overflow-y-auto py-1">
          {THEMES.map((t, i) => (
            <ThemeRow
              key={t.id}
              theme={t}
              isActive={i === cursor}
              isCommitted={t.id === currentTheme}
              onHover={() => setCursor(i)}
              onClick={() => {
                setCursor(i);
                onCommit(t.id);
                onClose();
              }}
            />
          ))}
        </div>

        <footer className="border-t border-[color:var(--color-rule-soft)] px-5 py-2.5">
          <div className="text-marginalia flex items-center gap-4">
            <span><b className="font-normal text-foreground">↑↓</b> preview</span>
            <span className="inline-flex items-center gap-1">
              <CornerDownLeft className="h-3 w-3" strokeWidth={1.8} />
              <span><b className="font-normal text-foreground">apply</b></span>
            </span>
            <span><b className="font-normal text-foreground">esc</b> revert</span>
            <span className="ml-auto">Theme</span>
          </div>
        </footer>
      </div>
    </div>
  );
}

function ThemeRow({
  theme,
  isActive,
  isCommitted,
  onHover,
  onClick,
}: {
  theme: ThemeMeta;
  isActive: boolean;
  isCommitted: boolean;
  onHover: () => void;
  onClick: () => void;
}) {
  const ApIcon = theme.appearance === "dark" ? Moon : Sun;
  return (
    <button
      onMouseEnter={onHover}
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-4 px-5 py-3 text-left transition-colors",
        isActive
          ? "bg-[color:var(--color-foil)]/[0.10]"
          : "hover:bg-[color:var(--color-surface-2)]/40",
      )}
    >
      {/* Swatch — three circles overlapping, telegraphing the palette */}
      <div className="relative flex shrink-0 items-center">
        <Swatch color={theme.swatches.bg} index={0} />
        <Swatch color={theme.swatches.surface} index={1} />
        <Swatch color={theme.swatches.foil} index={2} />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "font-display text-base",
              isActive ? "text-[color:var(--color-foil)]" : "text-foreground",
            )}
          >
            {theme.name}
          </span>
          <ApIcon className="h-3 w-3 text-[color:var(--color-fg-dim)]" strokeWidth={1.8} />
          {isCommitted && (
            <span className="text-marginalia inline-flex items-center gap-1 text-[color:var(--color-foil)]">
              <Check className="h-3 w-3" strokeWidth={2.4} />
              current
            </span>
          )}
        </div>
        <div className="font-display text-sm italic text-[color:var(--color-fg-2)]">
          {theme.description}
        </div>
        <div className="text-marginalia mt-0.5">{theme.type}</div>
      </div>
    </button>
  );
}

function Swatch({ color, index }: { color: string; index: number }) {
  return (
    <span
      aria-hidden
      className="block h-6 w-6 rounded-full border border-black/10 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.05)]"
      style={{
        background: color,
        marginLeft: index === 0 ? 0 : "-10px",
        zIndex: 3 - index,
      }}
    />
  );
}
