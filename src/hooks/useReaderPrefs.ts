import { useCallback, useEffect, useState } from "react";
import { DEFAULT_PREFS, parsePrefs, type ReaderPrefs } from "@/lib/reader";

const KEY = "markdownish.reader";

function load(): ReaderPrefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return parsePrefs(JSON.parse(raw));
  } catch {
    // localStorage or the stored JSON may be unusable; defaults are fine.
  }
  return DEFAULT_PREFS;
}

/**
 * Reading typography prefs (column width, text size, body font), persisted to
 * localStorage. Shared by the preview pane and reading mode so a document
 * doesn't reflow when you toggle between them.
 */
export function useReaderPrefs() {
  const [prefs, setPrefs] = useState<ReaderPrefs>(load);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(prefs));
    } catch {
      // ignore — the setting still applies for this session
    }
  }, [prefs]);

  const update = useCallback((patch: Partial<ReaderPrefs>) => {
    setPrefs((p) => ({ ...p, ...patch }));
  }, []);

  const reset = useCallback(() => setPrefs(DEFAULT_PREFS), []);

  return { prefs, update, reset };
}
