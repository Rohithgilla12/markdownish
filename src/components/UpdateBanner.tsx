import { useEffect, useState } from "react";
import { ArrowDownToLine } from "lucide-react";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

type State =
  | { kind: "idle" }
  | { kind: "available"; update: Update }
  | { kind: "downloading"; downloaded: number; total: number | null }
  | { kind: "ready" }
  | { kind: "error"; message: string };

/**
 * Checks for an update on mount. If one is available, slides in a tiny pill at
 * the bottom of the window. Clicking it downloads + installs + relaunches.
 *
 * Failures (no network, GitHub down, signature mismatch) are swallowed — we
 * never block the user from editing because the updater is sad.
 */
export function UpdateBanner() {
  const [state, setState] = useState<State>({ kind: "idle" });

  useEffect(() => {
    let cancelled = false;
    check()
      .then((update) => {
        if (cancelled) return;
        if (update) setState({ kind: "available", update });
      })
      .catch(() => {
        // Updater errors are intentionally non-fatal; logged to devtools only.
        // (See `check()` docs — it can throw on offline, dev-mode launches,
        // or a missing endpoint.)
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function install() {
    if (state.kind !== "available") return;
    const update = state.update;
    setState({ kind: "downloading", downloaded: 0, total: null });
    try {
      await update.downloadAndInstall((event) => {
        if (event.event === "Started") {
          setState({ kind: "downloading", downloaded: 0, total: event.data.contentLength ?? null });
        } else if (event.event === "Progress") {
          setState((prev) =>
            prev.kind === "downloading"
              ? { ...prev, downloaded: prev.downloaded + event.data.chunkLength }
              : prev,
          );
        } else if (event.event === "Finished") {
          setState({ kind: "ready" });
        }
      });
      await relaunch();
    } catch (e) {
      setState({ kind: "error", message: String(e) });
    }
  }

  if (state.kind === "idle") return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center">
      <div
        role="status"
        className="pointer-events-auto flex items-center gap-3 rounded-full border border-[color:var(--color-foil)]/40 bg-[color:var(--color-surface-2)]/95 px-4 py-2 shadow-[0_18px_40px_-18px_rgba(0,0,0,0.6)] backdrop-blur"
      >
        {renderBody(state, install)}
      </div>
    </div>
  );
}

function renderBody(state: Exclude<State, { kind: "idle" }>, install: () => void) {
  if (state.kind === "available") {
    return (
      <>
        <ArrowDownToLine className="h-3.5 w-3.5 text-[color:var(--color-foil)]" strokeWidth={1.6} />
        <span className="font-display italic text-sm text-foreground">
          v{state.update.version} is out
        </span>
        <button
          onClick={install}
          className="ml-2 rounded-full bg-[color:var(--color-foil)]/15 px-3 py-1 font-mono text-[11px] tracking-[0.14em] uppercase text-[color:var(--color-foil)] hover:bg-[color:var(--color-foil)]/25"
        >
          Update &amp; restart
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
      <span className="text-marginalia">
        Downloading update{pct !== null ? ` · ${pct}%` : "…"}
      </span>
    );
  }
  if (state.kind === "ready") {
    return <span className="text-marginalia">Installing &amp; relaunching…</span>;
  }
  // error
  return (
    <span className="text-marginalia text-[color:var(--color-foil)]">
      Update failed — try again later
    </span>
  );
}
