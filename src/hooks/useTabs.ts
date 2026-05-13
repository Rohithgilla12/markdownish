import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

type Status = "loading" | "ready" | "saving";

type FileRead = { content: string; mtime: number };

export type TabConflict = {
  newContent: string;
  newMtime: number;
};

export type Tab = {
  path: string;
  content: string;
  original: string;
  mtime: number;
  status: Status;
  error: string | null;
  conflict: TabConflict | null;
};

const WATCH_INTERVAL_MS = 800;
const AUTOSAVE_DEBOUNCE_MS = 2000;

/**
 * Owns the whole stack of open tabs.
 *
 *  - openFile: open a fresh tab, or focus the existing one if the path is already open
 *  - closeFile: best-effort flush dirty content, then remove
 *  - setActiveContent: edits the currently active tab
 *  - saveActive: explicit Cmd+S save of the active tab
 *  - resolveConflict: pick a side when the active tab's file changed under us
 *
 * Auto-save and external-change polling only run for the *active* tab. Inactive
 * tabs keep their in-memory edits, but we don't poll them — that keeps the cost
 * of opening 20 tabs the same as opening one.
 */
export function useTabs() {
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);

  const tabsRef = useRef(tabs);
  const activeIndexRef = useRef(activeIndex);
  useEffect(() => {
    tabsRef.current = tabs;
    activeIndexRef.current = activeIndex;
  });

  const activeTab = activeIndex >= 0 ? tabs[activeIndex] : undefined;

  // Helpers — keep tab edits as immutable replacements.
  const patchTab = useCallback((path: string, patch: Partial<Tab>) => {
    setTabs((prev) => prev.map((t) => (t.path === path ? { ...t, ...patch } : t)));
  }, []);

  const openFile = useCallback(async (path: string) => {
    const existing = tabsRef.current.findIndex((t) => t.path === path);
    if (existing >= 0) {
      setActiveIndex(existing);
      return;
    }

    // Insert a loading placeholder, then load.
    const placeholder: Tab = {
      path,
      content: "",
      original: "",
      mtime: 0,
      status: "loading",
      error: null,
      conflict: null,
    };
    setTabs((prev) => {
      const next = [...prev, placeholder];
      // Activate the new tab. The state update is queued, so use the new length.
      setActiveIndex(next.length - 1);
      return next;
    });

    try {
      const result = await invoke<FileRead>("read_text_file", { path });
      patchTab(path, {
        content: result.content,
        original: result.content,
        mtime: result.mtime,
        status: "ready",
      });
    } catch (e) {
      patchTab(path, { error: String(e), status: "ready" });
    }
  }, [patchTab]);

  const closeFile = useCallback((path: string) => {
    const idx = tabsRef.current.findIndex((t) => t.path === path);
    if (idx < 0) return;
    const tab = tabsRef.current[idx];

    // Best-effort flush if dirty. Fire-and-forget; we don't block close.
    if (tab.content !== tab.original) {
      void invoke("write_text_file", { path: tab.path, contents: tab.content });
    }

    setTabs((prev) => prev.filter((t) => t.path !== path));

    const active = activeIndexRef.current;
    if (idx === active) {
      // Pick a neighbour, preferring the one to the right.
      const newLen = tabsRef.current.length - 1;
      if (newLen === 0) setActiveIndex(-1);
      else setActiveIndex(Math.min(idx, newLen - 1));
    } else if (idx < active) {
      setActiveIndex(active - 1);
    }
  }, []);

  const closeActive = useCallback(() => {
    const t = tabsRef.current[activeIndexRef.current];
    if (t) closeFile(t.path);
  }, [closeFile]);

  const setActiveContent = useCallback((content: string) => {
    const i = activeIndexRef.current;
    if (i < 0) return;
    setTabs((prev) => prev.map((t, idx) => (idx === i ? { ...t, content } : t)));
  }, []);

  const saveActive = useCallback(async () => {
    const t = tabsRef.current[activeIndexRef.current];
    if (!t || t.content === t.original) return;
    patchTab(t.path, { status: "saving" });
    try {
      const newMtime = await invoke<number>("write_text_file", {
        path: t.path,
        contents: t.content,
      });
      patchTab(t.path, { original: t.content, mtime: newMtime, status: "ready" });
    } catch (e) {
      patchTab(t.path, { error: String(e), status: "ready" });
    }
  }, [patchTab]);

  const resolveConflict = useCallback((action: "reload" | "keep") => {
    const t = tabsRef.current[activeIndexRef.current];
    if (!t || !t.conflict) return;
    const c = t.conflict;
    if (action === "reload") {
      patchTab(t.path, {
        content: c.newContent,
        original: c.newContent,
        mtime: c.newMtime,
        conflict: null,
      });
    } else {
      // Keep ours; advance mtime so we don't immediately retrigger the conflict.
      patchTab(t.path, { mtime: c.newMtime, conflict: null });
    }
  }, [patchTab]);

  const activate = useCallback((index: number) => {
    if (index < 0 || index >= tabsRef.current.length) return;
    setActiveIndex(index);
  }, []);

  // When the active tab changes, best-effort flush the previously-active tab if
  // it has unsaved edits. Without this, switching away from a dirty tab leaves
  // those edits in memory only, and the 2s auto-save timer is reset to follow
  // the *new* active tab.
  const prevActiveRef = useRef(activeIndex);
  useEffect(() => {
    const prev = prevActiveRef.current;
    prevActiveRef.current = activeIndex;
    if (prev < 0 || prev === activeIndex) return;
    const prevTab = tabsRef.current[prev];
    if (!prevTab || prevTab.content === prevTab.original) return;
    invoke<number>("write_text_file", { path: prevTab.path, contents: prevTab.content })
      .then((newMtime) =>
        patchTab(prevTab.path, { original: prevTab.content, mtime: newMtime }),
      )
      .catch(() => {
        /* Best-effort; if it fails, the dirty edits are still in memory. */
      });
  }, [activeIndex, patchTab]);

  // Auto-save 2s after the most recent edit on the active tab.
  useEffect(() => {
    if (!activeTab || activeTab.content === activeTab.original) return;
    const id = window.setTimeout(() => {
      void saveActive();
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [activeTab?.path, activeTab?.content, activeTab?.original, saveActive]);

  // Poll for external writes on the active tab.
  useEffect(() => {
    if (!activeTab || activeTab.status !== "ready") return;
    const path = activeTab.path;
    let cancelled = false;
    const id = window.setInterval(async () => {
      if (cancelled) return;
      const t = tabsRef.current.find((x) => x.path === path);
      if (!t) return;
      try {
        const onDisk = await invoke<number>("stat_mtime", { path });
        if (cancelled) return;
        if (onDisk <= t.mtime) return;

        const fresh = await invoke<FileRead>("read_text_file", { path });
        if (cancelled) return;

        if (fresh.content === t.content) {
          patchTab(path, { mtime: fresh.mtime, original: fresh.content });
          return;
        }

        const isDirty = t.content !== t.original;
        if (isDirty) {
          patchTab(path, { conflict: { newContent: fresh.content, newMtime: fresh.mtime } });
        } else {
          patchTab(path, {
            content: fresh.content,
            original: fresh.content,
            mtime: fresh.mtime,
          });
        }
      } catch {
        // File deleted, moved, or permission denied — give up quietly.
      }
    }, WATCH_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [activeTab?.path, activeTab?.status, patchTab]);

  return {
    tabs,
    activeIndex,
    activeTab,
    openFile,
    closeFile,
    closeActive,
    activate,
    setActiveContent,
    saveActive,
    resolveConflict,
  };
}
