import { useCallback, useEffect, useRef, useState } from "react";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { getVersion } from "@tauri-apps/api/app";

export type UpdaterState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "available"; update: Update }
  | { kind: "up-to-date"; version: string }
  | { kind: "downloading"; downloaded: number; total: number | null }
  | { kind: "ready" }
  | { kind: "error"; message: string };

/**
 * Owns auto-update state for the whole window.
 *
 *  - `state` is the current updater UI state
 *  - `check({ verbose })` triggers a check; if verbose is true the user explicitly
 *    asked, so we flip to "checking" and surface a "up-to-date" outcome too
 *  - `install()` downloads + installs + relaunches the available update
 *  - `dismiss()` collapses any non-actionable transient state
 *
 * `check({ verbose: false })` runs once on mount and silently sets "available"
 * when a new version exists. The manual Cmd+U path goes through verbose:true.
 */
export function useUpdater() {
  const [state, setState] = useState<UpdaterState>({ kind: "idle" });
  const checkingRef = useRef(false);

  const runCheck = useCallback(async (verbose: boolean) => {
    if (checkingRef.current) return;
    checkingRef.current = true;
    if (verbose) setState({ kind: "checking" });
    try {
      const update = await check();
      if (update) {
        setState({ kind: "available", update });
      } else if (verbose) {
        const v = await getVersion();
        setState({ kind: "up-to-date", version: v });
      } else {
        setState({ kind: "idle" });
      }
    } catch (e) {
      if (verbose) setState({ kind: "error", message: String(e) });
    } finally {
      checkingRef.current = false;
    }
  }, []);

  // One-shot check on mount.
  useEffect(() => {
    void runCheck(false);
  }, [runCheck]);

  // Auto-dismiss the up-to-date / error states after a few seconds so they
  // don't sit forever — but only those transient outcomes.
  useEffect(() => {
    if (state.kind !== "up-to-date" && state.kind !== "error") return;
    const id = window.setTimeout(() => setState({ kind: "idle" }), 4000);
    return () => clearTimeout(id);
  }, [state.kind]);

  const install = useCallback(async () => {
    if (state.kind !== "available") return;
    const update = state.update;
    setState({ kind: "downloading", downloaded: 0, total: null });
    try {
      await update.downloadAndInstall((event) => {
        if (event.event === "Started") {
          setState({
            kind: "downloading",
            downloaded: 0,
            total: event.data.contentLength ?? null,
          });
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
  }, [state]);

  const dismiss = useCallback(() => setState({ kind: "idle" }), []);

  return {
    state,
    check: (verbose: boolean = true) => runCheck(verbose),
    install,
    dismiss,
  };
}
