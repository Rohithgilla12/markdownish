import { useEffect, useState } from "react";
import { ArrowDownToLine, Check, Loader2, RefreshCw } from "lucide-react";
import type { UpdaterState } from "@/hooks/useUpdater";

type Props = {
  state: UpdaterState;
  onInstall: () => void;
  onDismiss: () => void;
};

/**
 * Auto-update banner — slides down from just below the native title bar so it
 * never collides with the editor footer the way the old bottom-anchored
 * banner did. Renders nothing in idle state; one banner per outcome
 * (available, checking, up-to-date, downloading, ready, error).
 */
export function UpdateBanner({ state, onInstall, onDismiss }: Props) {
  // Small mount animation so the banner glides in.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    if (state.kind === "idle") {
      setMounted(false);
      return;
    }
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, [state.kind]);

  if (state.kind === "idle") return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-12 z-50 flex justify-center px-4"
    >
      <div
        className="pointer-events-auto flex items-center gap-3 rounded-full border border-[color:var(--color-foil)]/40 bg-[color:var(--color-surface-2)]/95 px-4 py-2 shadow-[0_18px_40px_-18px_rgba(0,0,0,0.6)] backdrop-blur"
        style={{
          transform: mounted ? "translateY(0)" : "translateY(-12px)",
          opacity: mounted ? 1 : 0,
          transition:
            "transform 320ms var(--ease-out-quart), opacity 320ms var(--ease-out-quart)",
        }}
      >
        {renderBody(state, onInstall, onDismiss)}
      </div>
    </div>
  );
}

function renderBody(
  state: Exclude<UpdaterState, { kind: "idle" }>,
  onInstall: () => void,
  onDismiss: () => void,
) {
  if (state.kind === "checking") {
    return (
      <>
        <Loader2 className="h-3.5 w-3.5 animate-spin text-[color:var(--color-foil)]" strokeWidth={1.8} />
        <span className="text-marginalia">Checking for updates…</span>
      </>
    );
  }

  if (state.kind === "available") {
    return (
      <>
        <ArrowDownToLine className="h-3.5 w-3.5 text-[color:var(--color-foil)]" strokeWidth={1.6} />
        <span className="font-display italic text-sm text-foreground">
          v{state.update.version} is out
        </span>
        <button
          onClick={onInstall}
          className="ml-1 rounded-full bg-[color:var(--color-foil)]/15 px-3 py-1 font-mono text-[11px] tracking-[0.14em] uppercase text-[color:var(--color-foil)] hover:bg-[color:var(--color-foil)]/25"
        >
          Update &amp; restart
        </button>
      </>
    );
  }

  if (state.kind === "up-to-date") {
    return (
      <>
        <Check className="h-3.5 w-3.5 text-[color:var(--color-foil)]" strokeWidth={2} />
        <span className="font-display italic text-sm text-foreground">
          You&rsquo;re on v{state.version} — latest
        </span>
        <button
          onClick={onDismiss}
          className="text-marginalia hover:text-foreground"
        >
          Dismiss
        </button>
      </>
    );
  }

  if (state.kind === "downloading") {
    const pct =
      state.total && state.total > 0
        ? Math.min(100, Math.round((state.downloaded / state.total) * 100))
        : null;
    return (
      <>
        <Loader2 className="h-3.5 w-3.5 animate-spin text-[color:var(--color-foil)]" strokeWidth={1.8} />
        <span className="text-marginalia">
          Downloading{pct !== null ? ` · ${pct}%` : "…"}
        </span>
      </>
    );
  }

  if (state.kind === "ready") {
    return (
      <>
        <RefreshCw className="h-3.5 w-3.5 animate-spin text-[color:var(--color-foil)]" strokeWidth={1.8} />
        <span className="text-marginalia">Installing &amp; relaunching…</span>
      </>
    );
  }

  // error
  return (
    <>
      <span className="font-display italic text-sm text-[color:var(--color-foil)]">
        Update failed
      </span>
      <span className="text-marginalia">{state.message.slice(0, 80)}</span>
      <button
        onClick={onDismiss}
        className="text-marginalia hover:text-foreground"
      >
        Dismiss
      </button>
    </>
  );
}
