import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { FileNode } from "@/lib/types";

type State = {
  tree: FileNode | null;
  error: string | null;
  loading: boolean;
};

export function useFolder(folder: string | null) {
  const [state, setState] = useState<State>({ tree: null, error: null, loading: false });

  const refresh = useCallback(async () => {
    if (!folder) return;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const tree = await invoke<FileNode>("read_tree", { path: folder });
      setState({ tree, error: null, loading: false });
    } catch (e) {
      setState({ tree: null, error: String(e), loading: false });
    }
  }, [folder]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { ...state, refresh };
}
