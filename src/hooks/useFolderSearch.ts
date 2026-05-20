import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

const DEBOUNCE_MS = 150;

export type SearchOpts = {
  caseSensitive: boolean;
  regex: boolean;
  wholeWord: boolean;
};

export type SearchMatch = {
  line: number;
  col: number;
  offset: number;
  length: number;
  snippet: string;
  snippetMatchStart: number;
  snippetMatchEnd: number;
};

export type FileMatches = {
  path: string;
  mtime: number;
  matches: SearchMatch[];
  truncated: boolean;
};

export type SearchResult = {
  files: FileMatches[];
  truncatedFiles: boolean;
  requestId: number;
  cancelled: boolean;
};

export type Replacement = { offset: number; length: number; text: string };
export type FileEdit = { path: string; expectedMtime: number; replacements: Replacement[] };

export type ReplaceOutcome =
  | { kind: "ok"; path: string; newMtime: number; replaced: number }
  | { kind: "staleMtime"; path: string; actualMtime: number }
  | { kind: "ioError"; path: string; message: string };

export type SearchState =
  | { status: "idle" }
  | { status: "loading"; query: string }
  | { status: "ready"; query: string; result: SearchResult }
  | { status: "error"; query: string; message: string };

const DEFAULT_OPTS: SearchOpts = { caseSensitive: false, regex: false, wholeWord: false };
const OPTS_STORAGE_KEY = "markdownish.searchOpts";

function loadStoredOpts(): SearchOpts {
  try {
    const raw = localStorage.getItem(OPTS_STORAGE_KEY);
    if (!raw) return DEFAULT_OPTS;
    const parsed = JSON.parse(raw);
    return {
      caseSensitive: !!parsed.caseSensitive,
      regex: !!parsed.regex,
      wholeWord: !!parsed.wholeWord,
    };
  } catch {
    return DEFAULT_OPTS;
  }
}

export function useFolderSearch(folder: string | null) {
  const [query, setQuery] = useState("");
  const [opts, setOptsState] = useState<SearchOpts>(loadStoredOpts);
  const [state, setState] = useState<SearchState>({ status: "idle" });

  const requestIdRef = useRef(0);
  const folderRef = useRef(folder);
  useEffect(() => {
    folderRef.current = folder;
  });

  const setOpts = useCallback((next: SearchOpts) => {
    setOptsState(next);
    try {
      localStorage.setItem(OPTS_STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* localStorage unavailable — fine, opts just won't persist this session */
    }
  }, []);

  // Run a search whenever query/opts/folder change.
  useEffect(() => {
    const f = folder;
    if (!f) {
      setState({ status: "idle" });
      return;
    }
    if (!query.trim()) {
      setState({ status: "idle" });
      return;
    }

    const id = ++requestIdRef.current;
    setState({ status: "loading", query });

    const timer = setTimeout(async () => {
      try {
        const result = await invoke<SearchResult>("search_folder", {
          folder: f,
          query,
          opts,
          requestId: id,
        });
        if (id !== requestIdRef.current) return; // superseded
        if (result.cancelled) return;
        setState({ status: "ready", query, result });
      } catch (e) {
        if (id !== requestIdRef.current) return;
        setState({ status: "error", query, message: String(e) });
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [folder, query, opts]);

  const refresh = useCallback(() => {
    const f = folderRef.current;
    if (!f || !query.trim()) return;
    const id = ++requestIdRef.current;
    setState({ status: "loading", query });
    void invoke<SearchResult>("search_folder", {
      folder: f,
      query,
      opts,
      requestId: id,
    })
      .then((result) => {
        if (id !== requestIdRef.current) return;
        if (result.cancelled) return;
        setState({ status: "ready", query, result });
      })
      .catch((e) => {
        if (id !== requestIdRef.current) return;
        setState({ status: "error", query, message: String(e) });
      });
  }, [query, opts]);

  const replace = useCallback(async (edits: FileEdit[]): Promise<ReplaceOutcome[]> => {
    if (edits.length === 0) return [];
    return invoke<ReplaceOutcome[]>("replace_in_files", { edits });
  }, []);

  return useMemo(
    () => ({ state, query, setQuery, opts, setOpts, refresh, replace }),
    [state, query, opts, setOpts, refresh, replace],
  );
}
