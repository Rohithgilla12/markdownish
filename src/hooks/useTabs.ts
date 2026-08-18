import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { FileEvent } from "@/hooks/useFolderWatcher";

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
  /** Set when the file was removed externally while this tab was dirty. */
  deleted: boolean;
};

const AUTOSAVE_DEBOUNCE_MS = 2000;

/**
 * Owns the whole stack of open tabs.
 *
 *  - openFile: open a fresh tab, or focus the existing one if the path is already open
 *  - closeFile: best-effort flush dirty content, then remove
 *  - setActiveContent: edits the currently active tab
 *  - saveActive: explicit Cmd+S save of the active tab
 *  - resolveConflict: pick a side when the active tab's file changed under us
 *  - applyExternalEvent: react to a filesystem event from useFolderWatcher
 *  - resurrectDeleted: re-create a deleted file with the tab's current content
 *
 * External changes used to be detected by polling `stat_mtime` every 800ms
 * for the active tab. That polling is gone — `applyExternalEvent` is now
 * called by Workspace from a single recursive watcher and covers every
 * open tab, not just the active one.
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

  const patchTab = useCallback((path: string, patch: Partial<Tab>) => {
    setTabs((prev) => prev.map((t) => (t.path === path ? { ...t, ...patch } : t)));
  }, []);

  const openFile = useCallback(
    async (path: string) => {
      const existing = tabsRef.current.findIndex((t) => t.path === path);
      if (existing >= 0) {
        setActiveIndex(existing);
        return;
      }

      const placeholder: Tab = {
        path,
        content: "",
        original: "",
        mtime: 0,
        status: "loading",
        error: null,
        conflict: null,
        deleted: false,
      };
      setTabs((prev) => {
        const next = [...prev, placeholder];
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
    },
    [patchTab],
  );

  const closeFile = useCallback((path: string) => {
    const idx = tabsRef.current.findIndex((t) => t.path === path);
    if (idx < 0) return;
    const tab = tabsRef.current[idx];

    // Best-effort flush if dirty AND the file still exists on disk. We
    // never silently recreate a file the user deleted externally.
    if (tab.content !== tab.original && !tab.deleted) {
      void invoke("write_text_file", { path: tab.path, contents: tab.content });
    }

    setTabs((prev) => prev.filter((t) => t.path !== path));

    const active = activeIndexRef.current;
    if (idx === active) {
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
      patchTab(t.path, {
        original: t.content,
        mtime: newMtime,
        status: "ready",
        deleted: false,
      });
    } catch (e) {
      patchTab(t.path, { error: String(e), status: "ready" });
    }
  }, [patchTab]);

  const resolveConflict = useCallback(
    (action: "reload" | "keep") => {
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
        patchTab(t.path, { mtime: c.newMtime, conflict: null });
      }
    },
    [patchTab],
  );

  const activate = useCallback((index: number) => {
    if (index < 0 || index >= tabsRef.current.length) return;
    setActiveIndex(index);
  }, []);

  /**
   * Re-create a tab's file on disk after an external delete. Used by the
   * TabDeletedBanner's "Save" action. On success the tab is no longer
   * marked deleted and its content becomes the new on-disk truth.
   */
  const resurrectDeleted = useCallback(
    async (path: string) => {
      const t = tabsRef.current.find((x) => x.path === path);
      if (!t || !t.deleted) return;
      try {
        const newMtime = await invoke<number>("create_text_file", {
          path,
          contents: t.content,
        });
        patchTab(path, {
          original: t.content,
          mtime: newMtime,
          deleted: false,
          error: null,
        });
      } catch (e) {
        patchTab(path, { error: String(e) });
      }
    },
    [patchTab],
  );

  const applyExternalEvent = useCallback(
    async (event: FileEvent) => {
      const target = tabsRef.current.find((t) => t.path === event.path);
      if (!target) return;

      if (event.kind === "remove") {
        const isDirty = target.content !== target.original;
        if (isDirty) {
          patchTab(target.path, { deleted: true, conflict: null });
        } else {
          closeFile(target.path);
        }
        return;
      }

      // create/modify of an open file → check if content actually drifted.
      if (event.mtime <= target.mtime) return;
      try {
        const fresh = await invoke<FileRead>("read_text_file", { path: target.path });
        const current = tabsRef.current.find((t) => t.path === target.path);
        if (!current) return;
        if (fresh.content === current.content) {
          patchTab(current.path, {
            mtime: fresh.mtime,
            original: fresh.content,
            deleted: false,
          });
          return;
        }
        const isDirty = current.content !== current.original;
        if (isDirty) {
          patchTab(current.path, {
            conflict: { newContent: fresh.content, newMtime: fresh.mtime },
            deleted: false,
          });
        } else {
          patchTab(current.path, {
            content: fresh.content,
            original: fresh.content,
            mtime: fresh.mtime,
            deleted: false,
          });
        }
      } catch {
        // Disappeared during the race; treat as remove.
        const current = tabsRef.current.find((t) => t.path === target.path);
        if (!current) return;
        if (current.content !== current.original) {
          patchTab(current.path, { deleted: true });
        } else {
          closeFile(current.path);
        }
      }
    },
    [closeFile, patchTab],
  );

  // When the active tab changes, best-effort flush the previously-active tab if
  // it has unsaved edits and isn't deleted on disk.
  const prevActiveRef = useRef(activeIndex);
  useEffect(() => {
    const prev = prevActiveRef.current;
    prevActiveRef.current = activeIndex;
    if (prev < 0 || prev === activeIndex) return;
    const prevTab = tabsRef.current[prev];
    if (!prevTab || prevTab.content === prevTab.original || prevTab.deleted) return;
    invoke<number>("write_text_file", { path: prevTab.path, contents: prevTab.content })
      .then((newMtime) =>
        patchTab(prevTab.path, { original: prevTab.content, mtime: newMtime }),
      )
      .catch(() => {
        /* Best-effort; if it fails, the dirty edits are still in memory. */
      });
  }, [activeIndex, patchTab]);

  // Auto-save 2s after the most recent edit on the active tab. Skipped if
  // the file is currently flagged as deleted on disk — saving there would
  // silently recreate the file, which the deletion banner is supposed to
  // surface as a deliberate choice.
  useEffect(() => {
    if (!activeTab || activeTab.content === activeTab.original) return;
    if (activeTab.deleted) return;
    const id = window.setTimeout(() => {
      void saveActive();
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [activeTab?.path, activeTab?.content, activeTab?.original, activeTab?.deleted, saveActive]);

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
    applyExternalEvent,
    resurrectDeleted,
  };
}
