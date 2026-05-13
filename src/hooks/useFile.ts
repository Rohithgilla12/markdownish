import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

type Status = "idle" | "loading" | "ready" | "saving";

/**
 * Loads, edits, and saves a single file.
 *
 * Behaviour matches the spec:
 *  - dirty whenever in-memory content differs from on-disk content
 *  - explicit save flushes to disk
 *  - a 2s debounce auto-saves as a safety net (after the most recent keystroke)
 *  - switching files attempts a best-effort flush of any pending changes first
 */
export function useFile(path: string | null) {
  const [content, setContent] = useState("");
  const [original, setOriginal] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  // Refs let us read the latest values inside callbacks and effect cleanups
  // without re-binding the handlers every keystroke.
  const pathRef = useRef(path);
  const contentRef = useRef(content);
  const originalRef = useRef(original);
  useEffect(() => {
    pathRef.current = path;
    contentRef.current = content;
    originalRef.current = original;
  });

  const dirty = path !== null && status === "ready" && content !== original;

  // Best-effort flush of the previous file before its path changes underneath us.
  // Cleanup is synchronous; we fire-and-forget the write.
  useEffect(() => {
    return () => {
      const p = pathRef.current;
      const c = contentRef.current;
      const o = originalRef.current;
      if (p && c !== o) {
        void invoke("write_text_file", { path: p, contents: c });
      }
    };
  }, [path]);

  // Load when path changes.
  useEffect(() => {
    if (!path) {
      setContent("");
      setOriginal("");
      setStatus("idle");
      setError(null);
      return;
    }
    let cancelled = false;
    setStatus("loading");
    setError(null);
    invoke<string>("read_text_file", { path })
      .then((text) => {
        if (cancelled) return;
        setContent(text);
        setOriginal(text);
        setStatus("ready");
      })
      .catch((e) => {
        if (cancelled) return;
        setError(String(e));
        setStatus("idle");
      });
    return () => {
      cancelled = true;
    };
  }, [path]);

  const save = useCallback(async () => {
    const p = pathRef.current;
    const c = contentRef.current;
    const o = originalRef.current;
    if (!p || c === o) return;
    setStatus("saving");
    try {
      await invoke("write_text_file", { path: p, contents: c });
      setOriginal(c);
      setStatus("ready");
    } catch (e) {
      setError(String(e));
      setStatus("ready");
    }
  }, []);

  // Auto-save 2s after the most recent edit. The timer restarts every keystroke.
  useEffect(() => {
    if (!dirty) return;
    const t = setTimeout(() => {
      void save();
    }, 2000);
    return () => clearTimeout(t);
  }, [content, dirty, save]);

  return { content, setContent, save, dirty, status, error };
}
