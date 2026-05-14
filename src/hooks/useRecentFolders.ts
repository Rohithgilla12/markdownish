import { useCallback, useEffect, useState } from "react";

const KEY = "markdownish.recent-folders";
const MAX = 5;

/**
 * Canonicalise a path before storing/comparing so subtle differences
 * (trailing slash, double slashes from a CLI arg) don't produce duplicate
 * entries that look identical in the UI but compare as different strings.
 */
function normalize(p: string): string {
  return p.replace(/\/+$/, "").replace(/\/{2,}/g, "/");
}

function load(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const items = parsed.filter((s): s is string => typeof s === "string");
    // Dedupe by normalised form, keeping the first (most recent) occurrence.
    const seen = new Set<string>();
    const out: string[] = [];
    for (const item of items) {
      const norm = normalize(item);
      if (!norm || seen.has(norm)) continue;
      seen.add(norm);
      out.push(norm);
    }
    return out.slice(0, MAX);
  } catch {
    return [];
  }
}

function persist(list: string[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
  } catch {
    // Storage might be unavailable in private windows or capped. Ignore.
  }
}

export function useRecentFolders() {
  const [folders, setFolders] = useState<string[]>(() => load());

  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === KEY) setFolders(load());
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const remember = useCallback((path: string) => {
    const norm = normalize(path);
    if (!norm) return;
    setFolders((prev) => {
      const filtered = prev.filter((p) => normalize(p) !== norm);
      const next = [norm, ...filtered].slice(0, MAX);
      persist(next);
      return next;
    });
  }, []);

  const forget = useCallback((path: string) => {
    const norm = normalize(path);
    setFolders((prev) => {
      const next = prev.filter((p) => normalize(p) !== norm);
      persist(next);
      return next;
    });
  }, []);

  return { folders, remember, forget };
}
