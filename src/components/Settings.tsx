import { useEffect, useRef, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { ChevronRight, Download, Palette, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { findTheme, type ThemeId } from "@/lib/themes";
import type { UpdaterState } from "@/hooks/useUpdater";

type Props = {
  themeId: ThemeId;
  updater: {
    state: UpdaterState;
    check: (verbose?: boolean) => void;
    install: () => void;
  };
  onOpenTheme: () => void;
  onClose: () => void;
};

function updateStatus(state: UpdaterState): string | null {
  switch (state.kind) {
    case "checking":
      return "Checking…";
    case "up-to-date":
      return `Up to date — v${state.version} is the latest.`;
    case "downloading": {
      const pct = state.total ? Math.round((state.downloaded / state.total) * 100) : null;
      return pct === null ? "Downloading…" : `Downloading… ${pct}%`;
    }
    case "ready":
      return "Update installed — restarting…";
    case "error":
      return state.message;
    default:
      return null;
  }
}

/**
 * Settings (⌘,): the app's few knobs in one dialog — theme, and updates.
 * The updater state is owned by App's `useUpdater`; this pane is just
 * another view over it, alongside the global UpdateBanner.
 */
export function Settings({ themeId, updater, onOpenTheme, onClose }: Props) {
  const theme = findTheme(themeId);
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    getVersion()
      .then((v) => {
        if (alive) setVersion(v);
      })
      .catch(() => {
        /* version stays blank — cosmetic only */
      });
    return () => {
      alive = false;
    };
  }, []);

  // Autofocus so Escape works without a click first.
  const rootRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    rootRef.current?.focus();
  }, []);

  const st = updater.state;
  const status = updateStatus(st);
  const busy = st.kind === "checking" || st.kind === "downloading" || st.kind === "ready";

  return (
    <div className="fixed inset-0 z-50 grid place-items-start pt-[14vh]" onMouseDown={onClose}>
      <div className="absolute inset-0 bg-[color:var(--color-bg)]/75 backdrop-blur-sm" aria-hidden />
      <div
        ref={rootRef}
        tabIndex={-1}
        role="dialog"
        aria-label="Settings"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            onClose();
          }
        }}
        className="relative mx-auto w-[min(540px,92vw)] overflow-hidden rounded-xl border border-[color:var(--color-rule)] bg-[color:var(--color-surface)]/95 shadow-[0_50px_120px_-30px_rgba(0,0,0,0.7)] focus:outline-none"
      >
        <header className="flex items-center gap-3 border-b border-[color:var(--color-rule-soft)] px-5 py-3">
          <span className="text-eyebrow text-[color:var(--color-foil)]">— Settings —</span>
          <span className="ml-auto text-marginalia">
            {version ? `Markdownish v${version}` : "Markdownish"}
          </span>
        </header>

        <div className="py-1">
          {/* Theme */}
          <button
            onClick={onOpenTheme}
            className="flex w-full items-center gap-4 px-5 py-3.5 text-left transition-colors hover:bg-[color:var(--color-surface-2)]/40"
          >
            <Palette className="h-4 w-4 shrink-0 text-[color:var(--color-fg-dim)]" strokeWidth={1.6} />
            <div className="min-w-0 flex-1">
              <div className="font-display text-base text-foreground">Theme</div>
              <div className="font-display text-sm italic text-[color:var(--color-fg-2)]">
                {theme.name} — {theme.description}
              </div>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-[color:var(--color-fg-dim)]" strokeWidth={1.6} />
          </button>

          <div className="mx-5 border-t border-[color:var(--color-rule-soft)]" aria-hidden />

          {/* Updates */}
          <div className="flex items-center gap-4 px-5 py-3.5">
            {st.kind === "available" ? (
              <Download className="h-4 w-4 shrink-0 text-[color:var(--color-foil)]" strokeWidth={1.6} />
            ) : (
              <RefreshCw
                className={cn(
                  "h-4 w-4 shrink-0 text-[color:var(--color-fg-dim)]",
                  busy && "animate-spin",
                )}
                strokeWidth={1.6}
              />
            )}
            <div className="min-w-0 flex-1">
              <div className="font-display text-base text-foreground">Updates</div>
              <div className="font-display text-sm italic text-[color:var(--color-fg-2)]">
                {st.kind === "available"
                  ? `Version ${st.update.version} is available.`
                  : (status ?? `Checks automatically on launch — or press ⌘U anytime.`)}
              </div>
            </div>
            {st.kind === "available" ? (
              <button
                onClick={updater.install}
                className="shrink-0 rounded-md border border-[color:var(--color-foil)]/50 px-3 py-1.5 text-[13px] text-[color:var(--color-foil)] transition-colors hover:bg-[color:var(--color-foil)]/[0.10]"
              >
                Install &amp; relaunch
              </button>
            ) : (
              <button
                onClick={() => updater.check(true)}
                disabled={busy}
                className="shrink-0 rounded-md border border-[color:var(--color-rule)] px-3 py-1.5 text-[13px] text-foreground transition-colors hover:border-[color:var(--color-foil)]/40 hover:text-[color:var(--color-foil)] disabled:opacity-50"
              >
                Check for updates
              </button>
            )}
          </div>
        </div>

        <footer className="border-t border-[color:var(--color-rule-soft)] px-5 py-2.5">
          <div className="text-marginalia flex items-center gap-4">
            <span><b className="font-normal text-foreground">esc</b> dismiss</span>
            <span className="ml-auto">Settings</span>
          </div>
        </footer>
      </div>
    </div>
  );
}
