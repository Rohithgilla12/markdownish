import { useCallback, useEffect, useState } from "react";

const KEY = "markdownish.recent-folders";
const MAX = 5;

function load(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((s): s is string => typeof s === "string").slice(0, MAX);
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

  // Cross-tab sync, in case the app is ever opened in multiple windows.
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === KEY) setFolders(load());
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const remember = useCallback((path: string) => {
    setFolders((prev) => {
      const next = [path, ...prev.filter((p) => p !== path)].slice(0, MAX);
      persist(next);
      return next;
    });
  }, []);

  const forget = useCallback((path: string) => {
    setFolders((prev) => {
      const next = prev.filter((p) => p !== path);
      persist(next);
      return next;
    });
  }, []);

  return { folders, remember, forget };
}
