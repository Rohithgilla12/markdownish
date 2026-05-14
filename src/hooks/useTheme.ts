import { useCallback, useEffect, useState } from "react";
import { DEFAULT_THEME, isThemeId, type ThemeId } from "@/lib/themes";

const KEY = "markdownish.theme";

function load(): ThemeId {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw && isThemeId(raw)) return raw;
  } catch {
    // localStorage may be unavailable in some webview contexts; fall back below.
  }
  return DEFAULT_THEME;
}

function apply(id: ThemeId) {
  document.documentElement.setAttribute("data-theme", id);
}

/**
 * Theme state with live preview support.
 *
 *  - `theme` is the committed theme (what's saved to localStorage)
 *  - `preview(id)` swaps the DOM to that theme without persisting
 *  - `commit(id)` swaps and persists
 *  - `revert()` returns to the committed theme (used when the picker is cancelled)
 *
 * The DOM data-theme is updated synchronously on mount so there's no flash of
 * the wrong theme on launch.
 */
export function useTheme() {
  const [theme, setTheme] = useState<ThemeId>(() => {
    const initial = load();
    // Apply during state-init render so the first paint is correct.
    if (typeof document !== "undefined") apply(initial);
    return initial;
  });

  // Cross-tab sync (rare for a desktop app, but free).
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key !== KEY || !e.newValue || !isThemeId(e.newValue)) return;
      setTheme(e.newValue);
      apply(e.newValue);
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const commit = useCallback((id: ThemeId) => {
    setTheme(id);
    apply(id);
    try {
      localStorage.setItem(KEY, id);
    } catch {
      // ignore — preview still works in-session
    }
  }, []);

  const preview = useCallback((id: ThemeId) => {
    apply(id);
  }, []);

  const revert = useCallback(() => {
    apply(theme);
  }, [theme]);

  return { theme, commit, preview, revert };
}
