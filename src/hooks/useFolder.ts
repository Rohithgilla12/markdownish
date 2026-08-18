import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { FileNode } from "@/lib/types";

type State = {
  tree: FileNode | null;
  error: string | null;
  /** First read of a folder — the sidebar shows a skeleton. */
  loading: boolean;
  /** Any read in flight, including background ones — spins the refresh icon. */
  refreshing: boolean;
};

const EMPTY: State = { tree: null, error: null, loading: false, refreshing: false };

export function useFolder(folder: string | null) {
  const [state, setState] = useState<State>(EMPTY);

  // Which folder the current `state` describes. Guards against a slow read
  // for folder A landing after the user has already switched to folder B.
  const forRef = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    if (!folder) {
      forRef.current = null;
      setState(EMPTY);
      return;
    }

    const isNewFolder = forRef.current !== folder;
    forRef.current = folder;

    // Only show the skeleton when there's nothing to show yet. Refreshes are
    // also driven by the folder watcher and by window focus, and flashing the
    // sidebar every time a file changes on disk is worse than letting the
    // tree swap in silently.
    setState((s) => ({
      tree: isNewFolder ? null : s.tree,
      error: null,
      loading: isNewFolder,
      refreshing: true,
    }));

    try {
      const tree = await invoke<FileNode>("read_tree", { path: folder });
      if (forRef.current !== folder) return;
      setState({ tree, error: null, loading: false, refreshing: false });
    } catch (e) {
      if (forRef.current !== folder) return;
      setState({ tree: null, error: String(e), loading: false, refreshing: false });
    }
  }, [folder]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { ...state, refresh };
}
