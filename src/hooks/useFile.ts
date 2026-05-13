import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

type Status = "idle" | "loading" | "ready" | "saving";

type FileRead = { content: string; mtime: number };

export type FileConflict = {
  newContent: string;
  newMtime: number;
};

const WATCH_INTERVAL_MS = 800;

/**
 * Loads, edits, saves, and watches a single file.
 *
 *  - Tracks an mtime baseline so we can detect external writes.
 *  - Silent reload when the file changes on disk and we have no unsaved edits.
 *  - Surfaces a conflict object when there's a clash; callers decide how to resolve.
 *  - 2s debounced auto-save as a safety net; explicit save via the returned callback.
 *  - Best-effort flush when switching files.
 */
export function useFile(path: string | null) {
  const [content, setContent] = useState("");
  const [original, setOriginal] = useState("");
  const [mtime, setMtime] = useState(0);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<FileConflict | null>(null);

  const pathRef = useRef(path);
  const contentRef = useRef(content);
  const originalRef = useRef(original);
  const mtimeRef = useRef(mtime);
  useEffect(() => {
    pathRef.current = path;
    contentRef.current = content;
    originalRef.current = original;
    mtimeRef.current = mtime;
  });

  const dirty = path !== null && status === "ready" && content !== original;

  // Best-effort flush of previous file when path changes.
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
      setMtime(0);
      setStatus("idle");
      setError(null);
      setConflict(null);
      return;
    }
    let cancelled = false;
    setStatus("loading");
    setError(null);
    setConflict(null);
    invoke<FileRead>("read_text_file", { path })
      .then(({ content, mtime }) => {
        if (cancelled) return;
        setContent(content);
        setOriginal(content);
        setMtime(mtime);
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
      const newMtime = await invoke<number>("write_text_file", { path: p, contents: c });
      setOriginal(c);
      setMtime(newMtime);
      setStatus("ready");
    } catch (e) {
      setError(String(e));
      setStatus("ready");
    }
  }, []);

  // Auto-save 2s after last edit.
  useEffect(() => {
    if (!dirty) return;
    const t = setTimeout(() => {
      void save();
    }, 2000);
    return () => clearTimeout(t);
  }, [content, dirty, save]);

  // Poll for external writes. If mtime advanced and we're clean, reload silently.
  // If we have unsaved changes, surface a conflict for the user to resolve.
  useEffect(() => {
    if (!path || status === "idle") return;
    let cancelled = false;
    const id = window.setInterval(async () => {
      if (cancelled) return;
      const p = pathRef.current;
      if (!p) return;
      try {
        const onDisk = await invoke<number>("stat_mtime", { path: p });
        if (cancelled) return;
        if (onDisk <= mtimeRef.current) return;

        const fresh = await invoke<FileRead>("read_text_file", { path: p });
        if (cancelled) return;

        // Bail if the on-disk content actually matches what we have — can happen if
        // we just saved and the mtime advanced past our baseline by a few ticks.
        if (fresh.content === contentRef.current) {
          setMtime(fresh.mtime);
          setOriginal(fresh.content);
          return;
        }

        const isDirty = contentRef.current !== originalRef.current;
        if (isDirty) {
          setConflict({ newContent: fresh.content, newMtime: fresh.mtime });
        } else {
          // Silent reload.
          setContent(fresh.content);
          setOriginal(fresh.content);
          setMtime(fresh.mtime);
        }
      } catch {
        // File was deleted or moved — give up quietly for now.
      }
    }, WATCH_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [path, status]);

  const resolveConflict = useCallback((action: "reload" | "keep") => {
    setConflict((current) => {
      if (!current) return null;
      if (action === "reload") {
        setContent(current.newContent);
        setOriginal(current.newContent);
        setMtime(current.newMtime);
      } else {
        // Keep our edits; advance mtime so we don't immediately re-trigger the conflict.
        setMtime(current.newMtime);
      }
      return null;
    });
  }, []);

  return {
    content,
    setContent,
    save,
    dirty,
    status,
    error,
    conflict,
    resolveConflict,
  };
}
