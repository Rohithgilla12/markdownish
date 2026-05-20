# File Watcher & Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the active-tab mtime polling with an event-driven watcher across the whole open folder, add a Cmd+Shift+F find-and-replace panel that operates across the folder, and add a Cmd+F find/replace bar inside the editor.

**Architecture:** Single recursive `watch()` from `@tauri-apps/plugin-fs` dispatches into `useTabs` + tree refresh. Self-writes are suppressed via a Rust ring buffer queried before reacting. Folder search runs synchronously inside a cancellable Rust command using the `regex` crate. In-file find/replace uses the textarea's native selection as the current-match highlight, exposed via a new `EditorHandle` ref.

**Tech Stack:** Tauri 2, Rust (`regex`, `std::fs`), React 19, TypeScript, `@tauri-apps/plugin-fs` v2.5.

**Project convention overrides defaults:** CLAUDE.md says "No tests for v1 — I'll add them later if this thing actually sticks." Verification is therefore type-check + compile + manual smoke, not TDD test files. The user runs the dev server themselves; never run `pnpm tauri dev` without asking.

**Spec:** `docs/superpowers/specs/2026-05-19-file-watcher-and-search-design.md`

---

## File map

**Phase 1 — Watcher backbone**

- Modify: `src-tauri/Cargo.toml` — add `regex` dep (used in phase 2; added now so phase 2 doesn't need a separate cargo touch).
- Modify: `src-tauri/src/commands.rs` — add `SuppressionState`, `is_self_write`, suppression-recording hooks on writes.
- Modify: `src-tauri/src/lib.rs` — register state + new command.
- Modify: `src-tauri/capabilities/default.json` — add `fs:allow-watch`.
- Create: `src/hooks/useFolderWatcher.ts` — recursive `watch` wrapper with filter, debounce, self-write suppression.
- Modify: `src/hooks/useTabs.ts` — add `Tab.deleted` field, add `applyExternalEvent`, remove the 800ms polling effect.
- Create: `src/components/TabDeletedBanner.tsx` — per-tab banner when the file is deleted on disk.
- Modify: `src/components/Workspace.tsx` — mount `useFolderWatcher`, route events, render `TabDeletedBanner`.

**Phase 2 — Folder search panel**

- Modify: `src-tauri/src/commands.rs` — add `search_folder`, `replace_in_files`, `SearchState`, plus their types.
- Modify: `src-tauri/src/lib.rs` — register `SearchState` and new commands.
- Create: `src/hooks/useFolderSearch.ts` — debounced search + request_id cancellation + replace helper.
- Create: `src/components/FindReplacePanel.tsx` — Cmd+Shift+F modal.
- Modify: `src/components/Workspace.tsx` — Cmd+Shift+F binding, palette entry, panel render.

**Phase 3 — In-file find/replace bar**

- Modify: `src/components/Editor.tsx` — convert to `forwardRef`, expose `EditorHandle`, mount `EditorFindBar`, handle Cmd+F / Cmd+Option+F / Cmd+H.
- Create: `src/components/EditorFindBar.tsx` — the inline bar with find + replace controls.
- Modify: `src/components/Workspace.tsx` — palette entries for the two in-file find commands.

---

## Phase 1 — Watcher backbone

### Task 1.1: Add `regex` crate and `SuppressionState`

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/src/commands.rs`

- [ ] **Step 1: Add `regex` dependency to Cargo.toml**

In `src-tauri/Cargo.toml`, in the `[dependencies]` section, add:

```toml
regex = "1"
```

- [ ] **Step 2: Add suppression types to `commands.rs`**

At the top of `src-tauri/src/commands.rs`, change the imports to:

```rust
use serde::Serialize;
use std::collections::VecDeque;
use std::fs;
use std::path::Path;
use std::sync::Mutex;
use std::time::{Duration, Instant, UNIX_EPOCH};
```

Then, **append** at the end of the file:

```rust
const SUPPRESSION_TTL: Duration = Duration::from_secs(5);
const SUPPRESSION_MAX: usize = 32;

/// Records (path, mtime) pairs for each successful self-initiated write
/// so the JS-side watcher can drop the resulting filesystem event
/// instead of treating it as an external change. Entries expire after
/// 5 seconds.
#[derive(Default)]
pub struct SuppressionState(pub Mutex<VecDeque<(String, u128, Instant)>>);

impl SuppressionState {
    fn record(&self, path: &str, mtime: u128) {
        if let Ok(mut q) = self.0.lock() {
            let now = Instant::now();
            q.push_back((path.to_string(), mtime, now));
            while q.len() > SUPPRESSION_MAX {
                q.pop_front();
            }
        }
    }

    fn matches(&self, path: &str, mtime: u128) -> bool {
        if let Ok(mut q) = self.0.lock() {
            let now = Instant::now();
            q.retain(|(_, _, t)| now.duration_since(*t) < SUPPRESSION_TTL);
            return q.iter().any(|(p, m, _)| p == path && *m == mtime);
        }
        false
    }
}

#[tauri::command]
pub fn is_self_write(
    path: String,
    mtime: u128,
    state: tauri::State<'_, SuppressionState>,
) -> bool {
    state.matches(&path, mtime)
}
```

- [ ] **Step 3: Record self-writes from `write_text_file` and `create_text_file`**

Replace the existing `write_text_file` and `create_text_file` functions (currently at `src-tauri/src/commands.rs:135-158`) with:

```rust
#[tauri::command]
pub fn write_text_file(
    path: String,
    contents: String,
    state: tauri::State<'_, SuppressionState>,
) -> Result<u128, String> {
    fs::write(&path, contents).map_err(|e| e.to_string())?;
    let mtime = mtime_of(&path)?;
    state.record(&path, mtime);
    Ok(mtime)
}

/// Create a new file. Fails if the file already exists — the caller is
/// expected to disambiguate the name before retrying. Parent directories
/// are created on demand so `docs/new-spec.md` works without a separate
/// mkdir round-trip.
#[tauri::command]
pub fn create_text_file(
    path: String,
    contents: String,
    state: tauri::State<'_, SuppressionState>,
) -> Result<u128, String> {
    let p = Path::new(&path);
    if p.exists() {
        return Err(format!("File already exists: {}", path));
    }
    if let Some(parent) = p.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
    }
    fs::write(&path, contents).map_err(|e| e.to_string())?;
    let mtime = mtime_of(&path)?;
    state.record(&path, mtime);
    Ok(mtime)
}
```

Note: `mtime_of` now returns `Result<u128, String>` end-to-end (no more `.unwrap_or(0)` fallback in the write path). That's deliberate — if we wrote successfully but the mtime read failed, we want the error rather than a silent 0.

- [ ] **Step 4: Register state and command in `lib.rs`**

In `src-tauri/src/lib.rs`, change the `use commands::...` line at the top to also import `SuppressionState`:

```rust
use commands::{resolve_open, OpenPath, SuppressionState};
```

Then inside `run()`, after `.manage(LaunchState::default())`, add:

```rust
        .manage(SuppressionState::default())
```

And in the `invoke_handler` macro list, add `commands::is_self_write,` after `commands::stat_mtime,`.

- [ ] **Step 5: Verify Rust compiles**

Run: `cd src-tauri && cargo check`
Expected: `Finished \`dev\` profile` with no errors. Warnings about unused `SuppressionState` field are OK at this point (no JS caller yet).

- [ ] **Step 6: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/commands.rs src-tauri/src/lib.rs
git commit -m "feat(watcher): self-write suppression state + is_self_write command

Every successful write_text_file / create_text_file now records the
resulting (path, mtime) into a small ring buffer. The new is_self_write
command lets the upcoming JS watcher drop events caused by our own
saves. Also adds the regex crate dep that phase 2 will need."
```

---

### Task 1.2: Grant `fs:allow-watch` capability

**Files:**
- Modify: `src-tauri/capabilities/default.json`

- [ ] **Step 1: Add the permission**

In `src-tauri/capabilities/default.json`, add `"fs:allow-watch"` to the `permissions` array. Final file:

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Permissions for the main window.",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "opener:default",
    "dialog:allow-open",
    "fs:allow-read-text-file",
    "fs:allow-write-text-file",
    "fs:allow-read-dir",
    "fs:allow-exists",
    "fs:allow-stat",
    "fs:allow-watch",
    "cli:default",
    "updater:default",
    "process:default",
    "process:allow-restart"
  ]
}
```

- [ ] **Step 2: Commit**

```bash
git add src-tauri/capabilities/default.json
git commit -m "feat(watcher): grant fs:allow-watch capability"
```

---

### Task 1.3: Add `useFolderWatcher` hook

**Files:**
- Create: `src/hooks/useFolderWatcher.ts`

- [ ] **Step 1: Write the hook**

Create `src/hooks/useFolderWatcher.ts` with this content:

```ts
import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { watchImmediate, type UnwatchFn } from "@tauri-apps/plugin-fs";

const MARKDOWN_EXTS = [".md", ".mdx", ".markdown"];
const SKIP_SEGMENTS = new Set(["node_modules", "target", "dist", "build"]);
const DEBOUNCE_MS = 200;

export type WatcherEvent =
  | { kind: "create"; path: string; mtime: number }
  | { kind: "modify"; path: string; mtime: number }
  | { kind: "remove"; path: string };

function pathMatters(path: string): boolean {
  const segments = path.split(/[\\/]/);
  for (const seg of segments) {
    if (!seg) continue;
    if (seg.startsWith(".")) return false;
    if (SKIP_SEGMENTS.has(seg)) return false;
  }
  const last = segments[segments.length - 1] ?? "";
  return MARKDOWN_EXTS.some((ext) => last.toLowerCase().endsWith(ext));
}

type RawEvent = {
  type: unknown;
  paths?: string[];
};

/**
 * Normalises a `tauri-plugin-fs` notify event into one of our high-level
 * kinds. Returns null for events we don't care about (touches without
 * data changes, dir-only events, access events, etc.).
 */
function classify(ev: RawEvent): "create" | "modify" | "remove" | null {
  const t = ev.type;
  if (typeof t === "string") {
    if (t === "any") return "modify";
    return null;
  }
  if (t && typeof t === "object") {
    const obj = t as Record<string, unknown>;
    if ("create" in obj) return "create";
    if ("remove" in obj) return "remove";
    if ("modify" in obj) {
      const mod = obj.modify as Record<string, unknown> | undefined;
      if (mod && "kind" in mod) {
        const kind = mod.kind;
        if (kind === "rename") {
          // notify reports rename as a modify; we treat each affected path
          // independently — the OS will fire a separate remove on the old
          // path and a create on the new one in the recursive watch.
          return "modify";
        }
      }
      return "modify";
    }
  }
  return null;
}

export function useFolderWatcher(
  folder: string | null,
  onEvent: (ev: WatcherEvent) => void,
): void {
  const onEventRef = useRef(onEvent);
  useEffect(() => {
    onEventRef.current = onEvent;
  });

  useEffect(() => {
    if (!folder) return;

    let cancelled = false;
    let unwatch: UnwatchFn | null = null;
    const pending = new Map<string, ReturnType<typeof setTimeout>>();

    const fire = (path: string, kind: "create" | "modify" | "remove") => {
      const existing = pending.get(path);
      if (existing) clearTimeout(existing);
      pending.set(
        path,
        setTimeout(async () => {
          pending.delete(path);
          if (cancelled) return;

          if (kind === "remove") {
            onEventRef.current({ kind: "remove", path });
            return;
          }

          try {
            const mtime = await invoke<number>("stat_mtime", { path });
            if (cancelled) return;
            const isSelf = await invoke<boolean>("is_self_write", { path, mtime });
            if (cancelled || isSelf) return;
            onEventRef.current({ kind, path, mtime });
          } catch {
            // File vanished between event and stat — surface as a remove
            // so an open tab still gets the deletion treatment.
            if (!cancelled) onEventRef.current({ kind: "remove", path });
          }
        }, DEBOUNCE_MS),
      );
    };

    (async () => {
      try {
        unwatch = await watchImmediate(
          folder,
          (event) => {
            const raw = event as unknown as RawEvent;
            const kind = classify(raw);
            if (!kind) return;
            const paths = raw.paths ?? [];
            for (const p of paths) {
              if (!pathMatters(p)) continue;
              fire(p, kind);
            }
          },
          { recursive: true },
        );
        if (cancelled && unwatch) {
          unwatch();
          unwatch = null;
        }
      } catch (err) {
        console.error("useFolderWatcher: failed to start watch", err);
      }
    })();

    return () => {
      cancelled = true;
      for (const t of pending.values()) clearTimeout(t);
      pending.clear();
      if (unwatch) unwatch();
    };
  }, [folder]);
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `pnpm tsc --noEmit`
Expected: no errors (the file is unused, but it must compile cleanly).

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useFolderWatcher.ts
git commit -m "feat(watcher): add useFolderWatcher hook

Recursive watch over the open folder, filtered to markdown files
outside node_modules / target / dist / build / dotfiles. Events
are debounced 200ms per path and dropped when is_self_write
matches. Unmount clears the pending queue and cancels the watch."
```

---

### Task 1.4: Extend `useTabs` with external-event handling

**Files:**
- Modify: `src/hooks/useTabs.ts`

- [ ] **Step 1: Add `deleted` field and `applyExternalEvent`, remove polling**

Replace the contents of `src/hooks/useTabs.ts` with:

```ts
import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { WatcherEvent } from "@/hooks/useFolderWatcher";

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
    async (event: WatcherEvent) => {
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
```

- [ ] **Step 2: Verify it type-checks**

Run: `pnpm tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useTabs.ts
git commit -m "refactor(tabs): drop mtime polling, add applyExternalEvent

The active-tab 800ms stat polling is replaced by a single
applyExternalEvent callback that the upcoming watcher feeds. New
Tab.deleted flag captures external-delete-while-dirty; saveActive
clears it, autosave skips it, and a new resurrectDeleted helper lets
the UI write the file back to disk explicitly."
```

---

### Task 1.5: Add `TabDeletedBanner` component

**Files:**
- Create: `src/components/TabDeletedBanner.tsx`

- [ ] **Step 1: Write the banner**

Create `src/components/TabDeletedBanner.tsx`:

```tsx
import { useEffect, useState } from "react";
import { AlertCircle } from "lucide-react";

type Props = {
  onSave: () => void;
  onClose: () => void;
};

/**
 * Surfaces when the file backing the active tab was deleted on disk
 * while the tab still has unsaved edits. Save re-creates the file from
 * memory; Close drops the tab (the in-memory edits go with it, the
 * confirm protects against accidental loss).
 */
export function TabDeletedBanner({ onSave, onClose }: Props) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  function handleClose() {
    const ok = window.confirm(
      "Close this tab? Your unsaved edits will be lost — the file no longer exists on disk.",
    );
    if (ok) onClose();
  }

  return (
    <div
      role="dialog"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-12 z-40 flex justify-center"
    >
      <div
        className="pointer-events-auto flex items-center gap-4 rounded-full border border-[color:var(--color-foil)]/40 bg-[color:var(--color-surface-2)]/95 px-5 py-2.5 shadow-[0_18px_40px_-18px_rgba(0,0,0,0.6)] backdrop-blur"
        style={{
          transform: mounted ? "translateY(0)" : "translateY(-12px)",
          opacity: mounted ? 1 : 0,
          transition:
            "transform 320ms var(--ease-out-quart), opacity 320ms var(--ease-out-quart)",
        }}
      >
        <AlertCircle className="h-4 w-4 shrink-0 text-[color:var(--color-foil)]" strokeWidth={1.5} />
        <div className="text-sm">
          <span className="font-display italic text-foreground">
            This file was deleted on disk while you were editing.
          </span>
        </div>
        <div className="ml-2 flex items-center gap-2">
          <button
            onClick={handleClose}
            className="rounded-full px-3 py-1 font-mono text-[11px] tracking-[0.14em] uppercase text-[color:var(--color-fg-dim)] hover:text-foreground"
          >
            Close
          </button>
          <button
            onClick={onSave}
            className="rounded-full bg-[color:var(--color-foil)]/15 px-3 py-1 font-mono text-[11px] tracking-[0.14em] uppercase text-[color:var(--color-foil)] hover:bg-[color:var(--color-foil)]/25"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `pnpm tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/TabDeletedBanner.tsx
git commit -m "feat(tabs): TabDeletedBanner for externally-deleted dirty files"
```

---

### Task 1.6: Wire watcher into Workspace

**Files:**
- Modify: `src/components/Workspace.tsx`

- [ ] **Step 1: Add imports**

In `src/components/Workspace.tsx`, change the import block at the top so the relevant imports look like this (only the additions are flagged):

```tsx
import { Sidebar } from "@/components/Sidebar";
import { Editor } from "@/components/Editor";
import { Preview } from "@/components/Preview";
import { ViewToggle, type ViewMode } from "@/components/ViewToggle";
import { ConflictToast } from "@/components/ConflictToast";
import { TabDeletedBanner } from "@/components/TabDeletedBanner";   // NEW
import { QuickOpen } from "@/components/QuickOpen";
import { ShortcutsHint } from "@/components/ShortcutsHint";
import { TabBar } from "@/components/TabBar";
import { ReadingView } from "@/components/ReadingView";
import { NewFileDialog } from "@/components/NewFileDialog";
import { CommandPalette, type Command } from "@/components/CommandPalette";
import { useFolder } from "@/hooks/useFolder";
import { useTabs } from "@/hooks/useTabs";
import { useFolderWatcher, type WatcherEvent } from "@/hooks/useFolderWatcher";  // NEW
import { useScrollSync } from "@/hooks/useScrollSync";
import { useTheme } from "@/hooks/useTheme";
import { THEMES } from "@/lib/themes";
import { cn } from "@/lib/utils";
```

- [ ] **Step 2: Mount the watcher**

Inside the `Workspace` function, after the line `const { theme, commit: commitTheme } = useTheme();`, add:

```tsx
  // Single recursive watcher over the open folder. Events fan out to
  // tree refresh + every open tab. The hook handles debouncing and
  // self-write suppression internally.
  const handleWatcherEvent = useCallback(
    (event: WatcherEvent) => {
      if (event.kind === "create" || event.kind === "remove") {
        void refreshFolder();
      }
      void t.applyExternalEvent(event);
    },
    [refreshFolder, t],
  );
  useFolderWatcher(folder, handleWatcherEvent);
```

- [ ] **Step 3: Render the deleted banner**

In the same file, find the existing `ConflictToast` block:

```tsx
          {t.activeTab?.conflict && (
            <ConflictToast
              onReload={() => t.resolveConflict("reload")}
              onKeep={() => t.resolveConflict("keep")}
            />
          )}
```

Add immediately after it:

```tsx
          {t.activeTab?.deleted && (
            <TabDeletedBanner
              onSave={() => t.activeTab && void t.resurrectDeleted(t.activeTab.path)}
              onClose={() => t.activeTab && t.closeFile(t.activeTab.path)}
            />
          )}
```

- [ ] **Step 4: Verify it type-checks and builds**

Run: `pnpm tsc --noEmit && pnpm build`
Expected: `vite v7.* building for production...` followed by a clean bundle with no errors.

- [ ] **Step 5: Ask the user to manually verify**

Before claiming phase 1 done, ask the user to run their dev server (the project convention is that they keep one open). Hand them this smoke list:

1. Open any folder. Edit `CLAUDE.md` in Markdownish, Cmd+S — should NOT trigger a conflict toast (self-write suppressed).
2. From a terminal, `echo "test" >> CLAUDE.md` while CLAUDE.md is the active tab and clean — Markdownish reloads silently.
3. Same as (2) but with unsaved edits — conflict toast appears with Keep / Reload.
4. `touch some-new-file.md` in the folder — appears in sidebar within ~250ms.
5. Open a clean tab, delete its file from terminal — tab closes silently.
6. Open a tab, edit it (don't save), delete its file from terminal — `TabDeletedBanner` appears. Click Save → file is recreated and the banner disappears.

If any step fails, debug before committing or moving on.

- [ ] **Step 6: Commit**

```bash
git add src/components/Workspace.tsx
git commit -m "feat(watcher): mount useFolderWatcher in Workspace

Folder watcher events fan out to (a) tree refresh on create/remove
and (b) useTabs.applyExternalEvent on every kind. Renders the new
TabDeletedBanner when the active tab's file is missing on disk."
```

---

## Phase 2 — Folder search & replace panel

### Task 2.1: Add `search_folder` Rust command

**Files:**
- Modify: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Append the search types and command to `commands.rs`**

At the end of `src-tauri/src/commands.rs`, append:

```rust
#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchOpts {
    pub case_sensitive: bool,
    pub regex: bool,
    pub whole_word: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchMatch {
    pub line: u32,
    pub col: u32,
    pub offset: u32,
    pub length: u32,
    pub snippet: String,
    pub snippet_match_start: u32,
    pub snippet_match_end: u32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileMatches {
    pub path: String,
    pub mtime: u128,
    pub matches: Vec<SearchMatch>,
    pub truncated: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResult {
    pub files: Vec<FileMatches>,
    pub truncated_files: bool,
    pub request_id: u64,
    pub cancelled: bool,
}

#[derive(Default)]
pub struct SearchState(pub Mutex<u64>);

const MAX_MATCHES_PER_FILE: usize = 200;
const MAX_FILES: usize = 50;
const SNIPPET_RADIUS: usize = 60;

fn build_pattern(query: &str, opts: &SearchOpts) -> Result<regex::Regex, String> {
    let escaped: String;
    let pattern_body = if opts.regex {
        query
    } else {
        escaped = regex::escape(query);
        escaped.as_str()
    };
    let with_word = if opts.whole_word {
        format!(r"\b(?:{})\b", pattern_body)
    } else {
        pattern_body.to_string()
    };
    let final_pattern = if opts.case_sensitive {
        with_word
    } else {
        format!("(?i){}", with_word)
    };
    regex::Regex::new(&final_pattern).map_err(|e| format!("Invalid regex: {}", e))
}

fn collect_md_files(root: &Path, out: &mut Vec<PathBuf>) {
    let Some(name) = root.file_name().map(|n| n.to_string_lossy().to_string()) else {
        return;
    };
    if name.starts_with('.') {
        return;
    }
    if root.is_dir() {
        if matches!(name.as_str(), "node_modules" | "target" | "dist" | "build") {
            return;
        }
        let Ok(entries) = fs::read_dir(root) else { return };
        for entry in entries.flatten() {
            collect_md_files(&entry.path(), out);
        }
    } else if is_markdown(root) {
        out.push(root.to_path_buf());
    }
}

/// Build a one-line snippet centred on a match. Returns the snippet plus
/// the match's start/end offsets *within the snippet*, both measured in
/// UTF-16 code units (which is what the JS textarea / browser DOM use).
fn build_snippet(line: &str, match_start: usize, match_end: usize) -> (String, u32, u32) {
    let start = match_start.saturating_sub(SNIPPET_RADIUS);
    let end = (match_end + SNIPPET_RADIUS).min(line.len());

    // Align to char boundaries so we don't slice mid-codepoint.
    let mut snippet_start = start;
    while snippet_start > 0 && !line.is_char_boundary(snippet_start) {
        snippet_start -= 1;
    }
    let mut snippet_end = end;
    while snippet_end < line.len() && !line.is_char_boundary(snippet_end) {
        snippet_end += 1;
    }
    let snippet = &line[snippet_start..snippet_end];
    let utf16_len = |s: &str| s.encode_utf16().count() as u32;
    let prefix_in_snippet_bytes = match_start - snippet_start;
    let match_bytes = match_end - match_start;
    let before = utf16_len(&snippet[..prefix_in_snippet_bytes]);
    let mlen = utf16_len(&snippet[prefix_in_snippet_bytes..prefix_in_snippet_bytes + match_bytes]);

    let mut decorated = String::with_capacity(snippet.len() + 2);
    if snippet_start > 0 {
        decorated.push('…');
    }
    decorated.push_str(snippet);
    if snippet_end < line.len() {
        decorated.push('…');
    }
    // The leading ellipsis adds 1 UTF-16 unit; account for it.
    let lead = if snippet_start > 0 { 1 } else { 0 };
    (decorated, before + lead, before + lead + mlen)
}

#[tauri::command]
pub fn search_folder(
    folder: String,
    query: String,
    opts: SearchOpts,
    request_id: u64,
    state: tauri::State<'_, SearchState>,
) -> Result<SearchResult, String> {
    // Mark our id as the latest accepted.
    if let Ok(mut current) = state.0.lock() {
        if request_id > *current {
            *current = request_id;
        }
    }

    let mut empty = SearchResult {
        files: Vec::new(),
        truncated_files: false,
        request_id,
        cancelled: false,
    };

    if query.is_empty() {
        return Ok(empty);
    }

    let pattern = build_pattern(&query, &opts)?;

    let root = Path::new(&folder);
    if !root.is_dir() {
        return Err(format!("Not a directory: {}", folder));
    }

    let mut files = Vec::new();
    collect_md_files(root, &mut files);

    let is_stale = |state: &tauri::State<'_, SearchState>| -> bool {
        state
            .0
            .lock()
            .map(|g| *g != request_id)
            .unwrap_or(false)
    };

    for path in files {
        if is_stale(&state) {
            empty.cancelled = true;
            return Ok(empty);
        }
        let Ok(content) = fs::read_to_string(&path) else { continue };
        let mtime = mtime_of(&path.to_string_lossy()).unwrap_or(0);

        let mut file_matches: Vec<SearchMatch> = Vec::new();
        let mut truncated_file = false;

        for m in pattern.find_iter(&content) {
            if file_matches.len() >= MAX_MATCHES_PER_FILE {
                truncated_file = true;
                break;
            }
            let start = m.start();
            let end = m.end();
            // Compute line + column.
            let preceding = &content[..start];
            let line_idx = preceding.matches('\n').count() as u32 + 1;
            let line_start = preceding.rfind('\n').map(|i| i + 1).unwrap_or(0);
            let line_end = content[start..].find('\n').map(|i| start + i).unwrap_or(content.len());
            let line = &content[line_start..line_end];
            let in_line_start = start - line_start;
            let in_line_end = end - line_start;
            let col_utf16 = line[..in_line_start].encode_utf16().count() as u32 + 1;

            let (snippet, sm_start, sm_end) = build_snippet(line, in_line_start, in_line_end);

            file_matches.push(SearchMatch {
                line: line_idx,
                col: col_utf16,
                offset: start as u32,
                length: (end - start) as u32,
                snippet,
                snippet_match_start: sm_start,
                snippet_match_end: sm_end,
            });
        }

        if !file_matches.is_empty() {
            if empty.files.len() >= MAX_FILES {
                empty.truncated_files = true;
                break;
            }
            empty.files.push(FileMatches {
                path: path.to_string_lossy().to_string(),
                mtime,
                matches: file_matches,
                truncated: truncated_file,
            });
        }
    }

    Ok(empty)
}
```

Add the missing `PathBuf` import at the top of the file by replacing `use std::path::Path;` with:

```rust
use std::path::{Path, PathBuf};
```

- [ ] **Step 2: Register state and command in `lib.rs`**

In `src-tauri/src/lib.rs`, expand the `use commands::...` line to:

```rust
use commands::{resolve_open, OpenPath, SearchState, SuppressionState};
```

After `.manage(SuppressionState::default())` add:

```rust
        .manage(SearchState::default())
```

And add `commands::search_folder,` to the `invoke_handler` list (after `commands::is_self_write,`).

- [ ] **Step 3: Verify Rust compiles**

Run: `cd src-tauri && cargo check`
Expected: clean compile.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/commands.rs src-tauri/src/lib.rs
git commit -m "feat(search): search_folder command + cancellable request state

Walks the open folder using the same filters as read_tree, greps each
markdown file with a compiled regex (escaped + word-bounded as needed),
and returns up to 50 files / 200 matches per file with snippet metadata
ready for the panel UI. Cancels mid-walk if a newer request_id arrives."
```

---

### Task 2.2: Add `replace_in_files` Rust command

**Files:**
- Modify: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Append the replace types and command to `commands.rs`**

At the end of `src-tauri/src/commands.rs`, append:

```rust
#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Replacement {
    pub offset: u32,
    pub length: u32,
    pub text: String,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileEdit {
    pub path: String,
    pub expected_mtime: u128,
    /// Must be sorted by `offset` DESCENDING so each splice doesn't
    /// invalidate the offsets of edits that haven't applied yet.
    pub replacements: Vec<Replacement>,
}

#[derive(Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum ReplaceOutcome {
    #[serde(rename_all = "camelCase")]
    Ok { path: String, new_mtime: u128, replaced: u32 },
    #[serde(rename_all = "camelCase")]
    StaleMtime { path: String, actual_mtime: u128 },
    #[serde(rename_all = "camelCase")]
    IoError { path: String, message: String },
}

fn apply_one_file(
    edit: &FileEdit,
    suppression: &SuppressionState,
) -> ReplaceOutcome {
    let actual_mtime = match mtime_of(&edit.path) {
        Ok(m) => m,
        Err(e) => {
            return ReplaceOutcome::IoError {
                path: edit.path.clone(),
                message: e,
            };
        }
    };
    if actual_mtime != edit.expected_mtime {
        return ReplaceOutcome::StaleMtime {
            path: edit.path.clone(),
            actual_mtime,
        };
    }
    let mut content = match fs::read_to_string(&edit.path) {
        Ok(c) => c,
        Err(e) => {
            return ReplaceOutcome::IoError {
                path: edit.path.clone(),
                message: e.to_string(),
            };
        }
    };

    // Each replacement consumes [offset, offset+length). The caller
    // guarantees descending offset order; if they didn't, splice
    // boundaries would shift and we'd corrupt the file. Defend against
    // that explicitly rather than trusting input.
    let mut last_start: Option<u32> = None;
    for r in &edit.replacements {
        if let Some(prev) = last_start {
            if r.offset + r.length > prev {
                return ReplaceOutcome::IoError {
                    path: edit.path.clone(),
                    message: "Replacements not sorted by descending offset".into(),
                };
            }
        }
        let start = r.offset as usize;
        let end = start + r.length as usize;
        if end > content.len()
            || !content.is_char_boundary(start)
            || !content.is_char_boundary(end)
        {
            return ReplaceOutcome::IoError {
                path: edit.path.clone(),
                message: format!("Replacement out of bounds at offset {}", r.offset),
            };
        }
        content.replace_range(start..end, &r.text);
        last_start = Some(r.offset);
    }

    // Atomic write: tmp file alongside, then rename over.
    let tmp_path = format!("{}.tmp~", edit.path);
    if let Err(e) = fs::write(&tmp_path, &content) {
        return ReplaceOutcome::IoError {
            path: edit.path.clone(),
            message: e.to_string(),
        };
    }
    if let Err(e) = fs::rename(&tmp_path, &edit.path) {
        let _ = fs::remove_file(&tmp_path);
        return ReplaceOutcome::IoError {
            path: edit.path.clone(),
            message: e.to_string(),
        };
    }

    let new_mtime = match mtime_of(&edit.path) {
        Ok(m) => m,
        Err(e) => {
            return ReplaceOutcome::IoError {
                path: edit.path.clone(),
                message: e,
            };
        }
    };
    suppression.record(&edit.path, new_mtime);
    ReplaceOutcome::Ok {
        path: edit.path.clone(),
        new_mtime,
        replaced: edit.replacements.len() as u32,
    }
}

#[tauri::command]
pub fn replace_in_files(
    edits: Vec<FileEdit>,
    state: tauri::State<'_, SuppressionState>,
) -> Vec<ReplaceOutcome> {
    edits
        .iter()
        .map(|e| apply_one_file(e, &state))
        .collect()
}
```

- [ ] **Step 2: Register the command**

In `src-tauri/src/lib.rs`, add `commands::replace_in_files,` to the `invoke_handler` list (after `commands::search_folder,`).

- [ ] **Step 3: Verify Rust compiles**

Run: `cd src-tauri && cargo check`
Expected: clean compile.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/commands.rs src-tauri/src/lib.rs
git commit -m "feat(search): replace_in_files command with atomic per-file writes

Validates expected_mtime per file, applies splice list bottom-up,
writes via tmp+rename, and records each new mtime into the suppression
ring buffer so the watcher doesn't echo the change back as a conflict
toast."
```

---

### Task 2.3: Add `useFolderSearch` hook

**Files:**
- Create: `src/hooks/useFolderSearch.ts`

- [ ] **Step 1: Write the hook**

Create `src/hooks/useFolderSearch.ts`:

```ts
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
    // Force a re-run by bumping a no-op opts churn → use setQuery same-value trick.
    // Simpler: bump the request id and re-issue inline.
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
```

- [ ] **Step 2: Verify it type-checks**

Run: `pnpm tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useFolderSearch.ts
git commit -m "feat(search): useFolderSearch hook with debounced cancellation"
```

---

### Task 2.4: Add `FindReplacePanel` component

**Files:**
- Create: `src/components/FindReplacePanel.tsx`

- [ ] **Step 1: Write the panel**

Create `src/components/FindReplacePanel.tsx`:

```tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Replace, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useFolderSearch,
  type FileEdit,
  type FileMatches,
  type ReplaceOutcome,
  type Replacement,
} from "@/hooks/useFolderSearch";

type Props = {
  folder: string;
  onSelectMatch: (path: string, offset: number, length: number) => void;
  onClose: () => void;
};

function relativise(folder: string, path: string): string {
  if (!path.startsWith(folder)) return path;
  return path.slice(folder.length).replace(/^[\\/]+/, "");
}

function basename(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

export function FindReplacePanel({ folder, onSelectMatch, onClose }: Props) {
  const { state, query, setQuery, opts, setOpts, refresh, replace } = useFolderSearch(folder);
  const [replacement, setReplacement] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const files: FileMatches[] = state.status === "ready" ? state.result.files : [];
  const errorMsg = state.status === "error" ? state.message : null;

  const totalMatches = useMemo(
    () => files.reduce((acc, f) => acc + f.matches.length, 0),
    [files],
  );

  function toggleFile(path: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  async function applyReplacements(filtered?: { path: string; matchIndex: number }) {
    if (busy) return;
    if (totalMatches === 0) return;

    let edits: FileEdit[];
    if (filtered) {
      const file = files.find((f) => f.path === filtered.path);
      const match = file?.matches[filtered.matchIndex];
      if (!file || !match) return;
      edits = [
        {
          path: file.path,
          expectedMtime: file.mtime,
          replacements: [
            { offset: match.offset, length: match.length, text: replacement },
          ],
        },
      ];
    } else {
      const visibleCount = files.length;
      const ok = window.confirm(
        `Replace ${totalMatches} match${totalMatches === 1 ? "" : "es"} across ${visibleCount} file${visibleCount === 1 ? "" : "s"}?`,
      );
      if (!ok) return;
      edits = files.map((f) => ({
        path: f.path,
        expectedMtime: f.mtime,
        // Sort descending so splices apply bottom-up.
        replacements: [...f.matches]
          .sort((a, b) => b.offset - a.offset)
          .map<Replacement>((m) => ({
            offset: m.offset,
            length: m.length,
            text: replacement,
          })),
      }));
    }

    setBusy(true);
    try {
      const outcomes = await replace(edits);
      const ok = outcomes.filter((o): o is Extract<ReplaceOutcome, { kind: "ok" }> => o.kind === "ok");
      const stale = outcomes.filter((o) => o.kind === "staleMtime");
      const ioErr = outcomes.filter((o) => o.kind === "ioError");
      const replacedCount = ok.reduce((acc, o) => acc + o.replaced, 0);

      const msgParts: string[] = [];
      if (replacedCount > 0) {
        msgParts.push(`Replaced ${replacedCount} in ${ok.length} file${ok.length === 1 ? "" : "s"}.`);
      }
      if (stale.length > 0) {
        msgParts.push(`${stale.length} file${stale.length === 1 ? "" : "s"} changed since search — refresh.`);
      }
      if (ioErr.length > 0) {
        msgParts.push(`${ioErr.length} file${ioErr.length === 1 ? "" : "s"} failed.`);
      }
      setNotice(msgParts.join(" ") || "Nothing to do.");
      refresh();
    } finally {
      setBusy(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void applyReplacements();
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-start pt-[10vh]" onMouseDown={onClose}>
      <div
        className="absolute inset-0 bg-[color:var(--color-bg)]/75 backdrop-blur-sm"
        aria-hidden
      />
      <div
        onMouseDown={(e) => e.stopPropagation()}
        className="relative mx-auto w-[min(820px,94vw)] overflow-hidden rounded-xl border border-[color:var(--color-rule)] bg-[color:var(--color-surface)]/95 shadow-[0_50px_120px_-30px_rgba(0,0,0,0.7)]"
      >
        {/* Query row */}
        <div className="flex items-center gap-3 border-b border-[color:var(--color-rule-soft)] px-4 py-3">
          <Search className="h-4 w-4 shrink-0 text-[color:var(--color-foil)]" strokeWidth={1.5} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Find in folder…"
            className="w-full bg-transparent font-display text-lg italic text-foreground placeholder:text-[color:var(--color-fg-faint)] focus:outline-none"
          />
          <div className="flex shrink-0 items-center gap-1">
            <Toggle
              label="Aa"
              active={opts.caseSensitive}
              onClick={() => setOpts({ ...opts, caseSensitive: !opts.caseSensitive })}
            />
            <Toggle
              label=".*"
              active={opts.regex}
              onClick={() => setOpts({ ...opts, regex: !opts.regex })}
            />
            <Toggle
              label="\b"
              active={opts.wholeWord}
              onClick={() => setOpts({ ...opts, wholeWord: !opts.wholeWord })}
            />
          </div>
        </div>

        {/* Replace row */}
        <div className="flex items-center gap-3 border-b border-[color:var(--color-rule-soft)] px-4 py-3">
          <Replace className="h-4 w-4 shrink-0 text-[color:var(--color-fg-dim)]" strokeWidth={1.5} />
          <input
            value={replacement}
            onChange={(e) => setReplacement(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Replace with…"
            className="w-full bg-transparent font-display text-base italic text-foreground placeholder:text-[color:var(--color-fg-faint)] focus:outline-none"
          />
          <button
            disabled={busy || totalMatches === 0}
            onClick={() => void applyReplacements()}
            className={cn(
              "rounded-full px-3 py-1 font-mono text-[11px] tracking-[0.14em] uppercase",
              busy || totalMatches === 0
                ? "bg-[color:var(--color-surface-2)]/40 text-[color:var(--color-fg-faint)]"
                : "bg-[color:var(--color-foil)]/15 text-[color:var(--color-foil)] hover:bg-[color:var(--color-foil)]/25",
            )}
          >
            Replace all
          </button>
        </div>

        {/* Notice / error */}
        {(errorMsg || notice) && (
          <div className="border-b border-[color:var(--color-rule-soft)] px-4 py-2 text-marginalia text-[color:var(--color-foil)]">
            {errorMsg ?? notice}
          </div>
        )}

        {/* Results */}
        <div className="max-h-[55vh] overflow-y-auto">
          {state.status === "loading" && (
            <div className="px-5 py-8 text-center text-marginalia">Searching…</div>
          )}
          {state.status === "idle" && (
            <div className="px-5 py-10 text-center font-display italic text-[color:var(--color-fg-2)]">
              Type to search this folder.
            </div>
          )}
          {state.status === "ready" && files.length === 0 && (
            <div className="px-5 py-10 text-center font-display italic text-[color:var(--color-fg-2)]">
              No matches for “{state.query}”.
            </div>
          )}
          {files.map((f) => {
            const isCollapsed = collapsed.has(f.path);
            return (
              <div key={f.path} className="border-b border-[color:var(--color-rule-soft)] last:border-b-0">
                <button
                  onClick={() => toggleFile(f.path)}
                  className="flex w-full items-center gap-2 px-4 py-2 text-left hover:bg-[color:var(--color-surface-2)]/30"
                >
                  {isCollapsed ? (
                    <ChevronRight className="h-3.5 w-3.5 text-[color:var(--color-fg-dim)]" strokeWidth={1.6} />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5 text-[color:var(--color-fg-dim)]" strokeWidth={1.6} />
                  )}
                  <span className="font-display text-base text-foreground">{basename(f.path)}</span>
                  <span className="text-marginalia truncate">{relativise(folder, f.path)}</span>
                  <span className="ml-auto text-marginalia">
                    {f.matches.length}
                    {f.truncated ? "+" : ""} match{f.matches.length === 1 ? "" : "es"}
                  </span>
                </button>
                {!isCollapsed && (
                  <div>
                    {f.matches.map((m, i) => (
                      <div
                        key={`${f.path}:${m.offset}`}
                        className="flex items-center gap-3 px-4 py-1.5 hover:bg-[color:var(--color-surface-2)]/30"
                      >
                        <button
                          onClick={() => {
                            onSelectMatch(f.path, m.offset, m.length);
                            onClose();
                          }}
                          className="flex flex-1 items-center gap-3 text-left"
                        >
                          <span className="font-mono text-marginalia w-10 shrink-0 text-right text-[color:var(--color-fg-dim)]">
                            {m.line}
                          </span>
                          <span className="font-mono text-[12.5px] text-[color:var(--color-fg-2)]">
                            {m.snippet.slice(0, m.snippetMatchStart)}
                            <mark className="bg-[color:var(--color-foil)]/30 text-foreground">
                              {m.snippet.slice(m.snippetMatchStart, m.snippetMatchEnd)}
                            </mark>
                            {m.snippet.slice(m.snippetMatchEnd)}
                          </span>
                        </button>
                        <button
                          disabled={busy}
                          onClick={() =>
                            void applyReplacements({ path: f.path, matchIndex: i })
                          }
                          className="rounded-full px-2 py-0.5 font-mono text-[10px] tracking-[0.14em] uppercase text-[color:var(--color-fg-dim)] hover:bg-[color:var(--color-foil)]/15 hover:text-[color:var(--color-foil)]"
                        >
                          Replace
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {state.status === "ready" && state.result.truncatedFiles && (
            <div className="px-5 py-3 text-center text-marginalia">
              Only showing the first {files.length} files with matches.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-[color:var(--color-rule-soft)] px-4 py-2">
          <div className="text-marginalia flex items-center gap-4">
            <span>
              <b className="font-normal text-foreground">⌘↵</b> replace all
            </span>
            <span>
              <b className="font-normal text-foreground">esc</b> dismiss
            </span>
            <span className="ml-auto">Find &amp; Replace</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function Toggle({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-md px-2 py-1 font-mono text-[11px] tracking-[0.14em] uppercase",
        active
          ? "bg-[color:var(--color-foil)]/15 text-[color:var(--color-foil)]"
          : "text-[color:var(--color-fg-dim)] hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `pnpm tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/FindReplacePanel.tsx
git commit -m "feat(search): FindReplacePanel modal

Cmd+Shift+F-shaped UI: query + replace inputs, case/regex/whole-word
toggles persisted to localStorage, grouped results with per-match
replace and bulk Replace all (with confirm). Match snippets are
pre-decorated by Rust and rendered with a <mark> highlight."
```

---

### Task 2.5: Wire Cmd+Shift+F into Workspace

**Files:**
- Modify: `src/components/Workspace.tsx`

- [ ] **Step 1: Import and state**

In `src/components/Workspace.tsx`:

1. Add to the import block:

```tsx
import { FindReplacePanel } from "@/components/FindReplacePanel";
```

2. Find the line `import { Search, ` (currently `Search` is already imported from lucide-react). Add `Replace` to that same import:

```tsx
import {
  BookOpen,
  Columns2,
  FileText,
  FilePlus,
  FolderOpen,
  Palette,
  Replace,                // NEW
  Save,
  Search,
  X,
} from "lucide-react";
```

3. After the existing `const [quickOpen, setQuickOpen] = useState(false);` line, add:

```tsx
  const [findInFolder, setFindInFolder] = useState(false);
```

- [ ] **Step 2: Bind Cmd+Shift+F in the shortcuts handler**

In the existing global shortcut effect (the one that starts with `function onKey(e: KeyboardEvent)`), find the branch for `e.key.toLowerCase() === "p"` and add this branch IMMEDIATELY ABOVE it:

```tsx
      } else if (e.shiftKey && e.key.toLowerCase() === "f") {
        e.preventDefault();
        setFindInFolder(true);
```

The shift check is important — without it this would steal plain Cmd+F from the in-file find bar in phase 3.

- [ ] **Step 3: Add palette entry**

In the `commands` useMemo block, immediately after the `quick-open` entry, add:

```tsx
    list.push({
      id: "find-in-folder",
      category: "File",
      label: "Find & Replace in folder…",
      description: "Search across every markdown file in this folder",
      shortcut: "⌘ ⇧ F",
      icon: Replace,
      keywords: ["search", "grep", "replace"],
      run: () => setFindInFolder(true),
    });
```

- [ ] **Step 4: Render the panel**

Find the existing `{quickOpen && ( <QuickOpen ... /> )}` block. Add immediately after it:

```tsx
      {findInFolder && (
        <FindReplacePanel
          folder={folder}
          onSelectMatch={(path, offset, length) => {
            void t.openFile(path).then(() => {
              // The Editor exposes its textarea via the existing scrollRef
              // pathway; we use a microtask + rAF so the new tab's content
              // is in the DOM before we set the selection.
              requestAnimationFrame(() => {
                const el = editorEl;
                if (!el) return;
                el.focus();
                el.setSelectionRange(offset, offset + length);
                // Scroll the match into view by nudging scrollTop based on
                // line-height. Cheap and good enough; the inline find bar
                // in phase 3 will do this more precisely.
                const before = el.value.slice(0, offset);
                const line = before.split("\n").length - 1;
                const lh = parseFloat(getComputedStyle(el).lineHeight) || 24;
                el.scrollTop = Math.max(0, line * lh - el.clientHeight / 2);
              });
            });
            setFindInFolder(false);
          }}
          onClose={() => setFindInFolder(false)}
        />
      )}
```

- [ ] **Step 5: Verify it type-checks and builds**

Run: `pnpm tsc --noEmit && pnpm build`
Expected: clean.

- [ ] **Step 6: Ask the user to smoke test**

Hand the user this checklist:

1. Cmd+Shift+F → panel opens, query input focused.
2. Type a string that exists in multiple files in the folder; results appear within 150–250ms.
3. Click a result → panel closes, file opens in a tab, the match is selected and visible.
4. Re-open the panel, type a replacement, click Replace all, confirm. Files update; no conflict toasts should appear on any currently-open tabs (suppression).
5. Toggle the regex/case/whole-word buttons and confirm they round-trip across panel re-opens (localStorage).

- [ ] **Step 7: Commit**

```bash
git add src/components/Workspace.tsx
git commit -m "feat(search): wire Cmd+Shift+F find-and-replace into Workspace

New global shortcut, palette entry, and panel render. Selecting a
result opens the file in a tab and selects the match in the editor's
textarea using a one-frame defer so the new content is mounted first."
```

---

## Phase 3 — In-file find/replace bar

### Task 3.1: Expose `EditorHandle` ref from `Editor.tsx`

**Files:**
- Modify: `src/components/Editor.tsx`

- [ ] **Step 1: Convert `Editor` to `forwardRef` and expose a handle**

In `src/components/Editor.tsx`:

1. Change the React import at the top to also import `forwardRef` and `useImperativeHandle`:

```tsx
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
```

2. Just below the `Props` type, add:

```tsx
export type EditorHandle = {
  getText: () => string;
  /** Brute-force replacement — DOES NOT participate in the textarea's
   * native undo stack. Use only for non-user-driven content swaps
   * (file reload, conflict resolution, snippet splice). For
   * user-visible edits that should be undoable with Cmd+Z, use
   * `insertAtSelection`. */
  setText: (text: string) => void;
  /** Replace the current selection with `text`, going through
   * `document.execCommand('insertText')` so the change is recorded
   * on the native undo stack. Call `setSelection` first to define
   * what gets replaced. Returns true if the insert was accepted. */
  insertAtSelection: (text: string) => boolean;
  getSelection: () => { start: number; end: number };
  setSelection: (start: number, end: number, scrollIntoView?: boolean) => void;
  focusEditor: () => void;
};
```

3. Convert the `Editor` function from `export function Editor({ ... }: Props)` to a `forwardRef`. Replace the `export function Editor({` line and the surrounding declaration up through the destructuring with:

```tsx
export const Editor = forwardRef<EditorHandle, Props>(function Editor(
  { path, content, onChange, onSave: _onSave, dirty, scrollRef, focus = false },
  ref,
) {
```

And at the very end of the function body (just before the final `}`), the closing brace becomes `});` (the forwardRef call needs its own closing).

Concretely, find the current ending:

```tsx
function extractQuery(content: string, slash: SlashState): string {
  return content.slice(slash.start + 1, slash.start + 1 + slash.queryLen);
}
```

Make sure the `Editor` function above it ends with `});` rather than `}`. The `extractQuery` helper stays as-is at the bottom of the file.

4. Inside the component, immediately after the existing `const setTextarea = useCallback(...)` block, add:

```tsx
  useImperativeHandle(
    ref,
    (): EditorHandle => ({
      getText: () => textareaRef.current?.value ?? "",
      setText: (text) => {
        const el = textareaRef.current;
        if (!el) return;
        el.value = text;
        setLiveValue(text);
        onChange(text);
      },
      insertAtSelection: (text) => {
        const el = textareaRef.current;
        if (!el) return false;
        el.focus();
        const ok = document.execCommand("insertText", false, text);
        if (ok) {
          // execCommand fires the textarea's input event, which the
          // existing onInput handler picks up — but we also manually
          // sync liveValue so any React-only consumer (word count,
          // slash menu) sees the change without a render delay.
          setLiveValue(el.value);
          onChange(el.value);
        }
        return ok;
      },
      getSelection: () => {
        const el = textareaRef.current;
        if (!el) return { start: 0, end: 0 };
        return { start: el.selectionStart, end: el.selectionEnd };
      },
      setSelection: (start, end, scrollIntoView = true) => {
        const el = textareaRef.current;
        if (!el) return;
        el.focus();
        el.setSelectionRange(start, end);
        if (scrollIntoView) {
          const before = el.value.slice(0, start);
          const line = before.split("\n").length - 1;
          const lh = parseFloat(getComputedStyle(el).lineHeight) || 24;
          el.scrollTop = Math.max(0, line * lh - el.clientHeight / 2);
        }
      },
      focusEditor: () => textareaRef.current?.focus(),
    }),
    [onChange],
  );
```

- [ ] **Step 2: Verify it type-checks**

Run: `pnpm tsc --noEmit`
Expected: clean. The `Editor` component is now a `forwardRef` returning the same JSX; existing call sites that don't pass a ref keep working unchanged.

- [ ] **Step 3: Commit**

```bash
git add src/components/Editor.tsx
git commit -m "refactor(editor): expose EditorHandle via forwardRef

getText/setText/getSelection/setSelection/focusEditor are enough to
drive the upcoming in-file find/replace bar without coupling it to
the textarea directly."
```

---

### Task 3.2: Add `EditorFindBar` component

**Files:**
- Create: `src/components/EditorFindBar.tsx`

- [ ] **Step 1: Write the bar**

Create `src/components/EditorFindBar.tsx`:

```tsx
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { ChevronDown, ChevronUp, Replace, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { EditorHandle } from "@/components/Editor";

type Props = {
  editorRef: RefObject<EditorHandle | null>;
  /** Externally controlled — Workspace opens the bar via keyboard. */
  open: boolean;
  /** Whether the replace row is initially visible. */
  initialMode: "find" | "replace";
  onClose: () => void;
  /** Notifies the parent when a replace mutated the editor text. The
   * parent uses this to mark the tab dirty / sync its `content` state. */
  onTextChanged: (text: string) => void;
};

type Opts = { caseSensitive: boolean; regex: boolean; wholeWord: boolean };

const OPTS_STORAGE_KEY = "markdownish.searchOpts"; // shared with folder search

function loadOpts(): Opts {
  try {
    const raw = localStorage.getItem(OPTS_STORAGE_KEY);
    if (!raw) return { caseSensitive: false, regex: false, wholeWord: false };
    const parsed = JSON.parse(raw);
    return {
      caseSensitive: !!parsed.caseSensitive,
      regex: !!parsed.regex,
      wholeWord: !!parsed.wholeWord,
    };
  } catch {
    return { caseSensitive: false, regex: false, wholeWord: false };
  }
}

function buildRegex(query: string, opts: Opts): RegExp | null {
  if (!query) return null;
  try {
    const body = opts.regex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const word = opts.wholeWord ? `\\b(?:${body})\\b` : body;
    const flags = opts.caseSensitive ? "g" : "gi";
    return new RegExp(word, flags);
  } catch {
    return null;
  }
}

type Match = { start: number; end: number };

function findAll(text: string, re: RegExp): Match[] {
  const out: Match[] = [];
  let m: RegExpExecArray | null;
  re.lastIndex = 0;
  while ((m = re.exec(text)) !== null) {
    out.push({ start: m.index, end: m.index + m[0].length });
    if (m[0].length === 0) re.lastIndex++; // guard zero-width matches
  }
  return out;
}

export function EditorFindBar({
  editorRef,
  open,
  initialMode,
  onClose,
  onTextChanged,
}: Props) {
  const [query, setQuery] = useState("");
  const [replacement, setReplacement] = useState("");
  const [opts, setOptsState] = useState<Opts>(loadOpts);
  const [mode, setMode] = useState<"find" | "replace">(initialMode);
  const [current, setCurrent] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const initialSelectionRef = useRef<{ start: number; end: number } | null>(null);

  const setOpts = useCallback((next: Opts) => {
    setOptsState(next);
    try {
      localStorage.setItem(OPTS_STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* fine */
    }
  }, []);

  // When the bar opens, capture current selection (so Esc can restore it)
  // and preseed the query from the selection if any.
  useEffect(() => {
    if (!open) return;
    setMode(initialMode);
    const sel = editorRef.current?.getSelection();
    initialSelectionRef.current = sel ?? null;
    if (sel && sel.end > sel.start) {
      const selected = editorRef.current?.getText().slice(sel.start, sel.end) ?? "";
      // Only preseed for short single-line selections.
      if (selected && !selected.includes("\n") && selected.length <= 120) {
        setQuery(selected);
      }
    }
    setCurrent(0);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [open, initialMode, editorRef]);

  const text = editorRef.current?.getText() ?? "";
  const regex = useMemo(() => buildRegex(query, opts), [query, opts]);
  const matches = useMemo(() => {
    if (!regex) return [];
    return findAll(text, regex);
  }, [text, regex]);

  // Clamp current when matches shrink.
  useEffect(() => {
    if (matches.length === 0) {
      setCurrent(0);
      return;
    }
    setCurrent((c) => (c >= matches.length ? 0 : c));
  }, [matches.length]);

  // Whenever current/matches change, select the active match in the editor.
  useEffect(() => {
    if (!open || matches.length === 0) return;
    const m = matches[current];
    if (!m) return;
    editorRef.current?.setSelection(m.start, m.end, true);
  }, [open, current, matches, editorRef]);

  const step = useCallback(
    (delta: 1 | -1) => {
      if (matches.length === 0) return;
      setCurrent((c) => (c + delta + matches.length) % matches.length);
    },
    [matches.length],
  );

  const replaceCurrent = useCallback(() => {
    if (matches.length === 0) return;
    const m = matches[current];
    // Going through insertAtSelection keeps the change on the textarea's
    // native undo stack, so Cmd+Z reverses it.
    editorRef.current?.setSelection(m.start, m.end, false);
    const ok = editorRef.current?.insertAtSelection(replacement) ?? false;
    if (!ok) return;
    onTextChanged(editorRef.current?.getText() ?? "");
    // The next iteration's match offsets have shifted; matches will
    // recompute from the new text. `current` stays in place — the
    // clamp effect will adjust it if we ran off the end.
  }, [matches, current, replacement, editorRef, onTextChanged]);

  const replaceAll = useCallback(() => {
    if (matches.length === 0 || !regex) return;
    const ok = window.confirm(
      `Replace ${matches.length} match${matches.length === 1 ? "" : "es"} in this file?`,
    );
    if (!ok) return;
    const next = text.replace(regex, replacement);
    // Single execCommand over the whole document = one undo step for
    // the entire batch, per the spec.
    const el = editorRef.current;
    if (!el) return;
    el.setSelection(0, text.length, false);
    const inserted = el.insertAtSelection(next);
    if (!inserted) return;
    onTextChanged(el.getText());
    setCurrent(0);
  }, [matches, regex, text, replacement, editorRef, onTextChanged]);

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      const sel = initialSelectionRef.current;
      if (sel) editorRef.current?.setSelection(sel.start, sel.end, false);
      else editorRef.current?.focusEditor();
      onClose();
    } else if (e.key === "Enter" || e.key === "F3") {
      e.preventDefault();
      step(e.shiftKey ? -1 : 1);
    }
  }

  if (!open) return null;

  return (
    <div
      role="search"
      className="absolute left-0 right-0 top-0 z-20 border-b border-[color:var(--color-rule-soft)] bg-[color:var(--color-surface-2)]/95 px-4 py-2 backdrop-blur"
    >
      <div className="flex items-center gap-2">
        <Search className="h-4 w-4 shrink-0 text-[color:var(--color-foil)]" strokeWidth={1.5} />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKey}
          placeholder="Find…"
          className="w-full bg-transparent font-mono text-[13px] text-foreground placeholder:text-[color:var(--color-fg-faint)] focus:outline-none"
        />
        <Toggle
          label="Aa"
          active={opts.caseSensitive}
          onClick={() => setOpts({ ...opts, caseSensitive: !opts.caseSensitive })}
        />
        <Toggle
          label=".*"
          active={opts.regex}
          onClick={() => setOpts({ ...opts, regex: !opts.regex })}
        />
        <Toggle
          label="\b"
          active={opts.wholeWord}
          onClick={() => setOpts({ ...opts, wholeWord: !opts.wholeWord })}
        />
        <span className="text-marginalia w-16 shrink-0 text-right tabular-nums">
          {matches.length === 0 ? "0 of 0" : `${current + 1} of ${matches.length}`}
        </span>
        <button
          aria-label="Previous match"
          onClick={() => step(-1)}
          className="rounded p-1 text-[color:var(--color-fg-dim)] hover:bg-[color:var(--color-foil)]/15 hover:text-[color:var(--color-foil)]"
        >
          <ChevronUp className="h-3.5 w-3.5" strokeWidth={1.6} />
        </button>
        <button
          aria-label="Next match"
          onClick={() => step(1)}
          className="rounded p-1 text-[color:var(--color-fg-dim)] hover:bg-[color:var(--color-foil)]/15 hover:text-[color:var(--color-foil)]"
        >
          <ChevronDown className="h-3.5 w-3.5" strokeWidth={1.6} />
        </button>
        <button
          aria-label={mode === "replace" ? "Hide replace" : "Show replace"}
          onClick={() => setMode(mode === "replace" ? "find" : "replace")}
          className={cn(
            "rounded p-1",
            mode === "replace"
              ? "bg-[color:var(--color-foil)]/15 text-[color:var(--color-foil)]"
              : "text-[color:var(--color-fg-dim)] hover:text-foreground",
          )}
        >
          <Replace className="h-3.5 w-3.5" strokeWidth={1.6} />
        </button>
        <button
          aria-label="Close find"
          onClick={onClose}
          className="rounded p-1 text-[color:var(--color-fg-dim)] hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" strokeWidth={1.6} />
        </button>
      </div>
      {mode === "replace" && (
        <div className="mt-1.5 flex items-center gap-2">
          <Replace className="h-4 w-4 shrink-0 text-[color:var(--color-fg-dim)]" strokeWidth={1.5} />
          <input
            value={replacement}
            onChange={(e) => setReplacement(e.target.value)}
            onKeyDown={onKey}
            placeholder="Replace with…"
            className="w-full bg-transparent font-mono text-[13px] text-foreground placeholder:text-[color:var(--color-fg-faint)] focus:outline-none"
          />
          <button
            disabled={matches.length === 0}
            onClick={replaceCurrent}
            className={cn(
              "rounded-full px-2 py-0.5 font-mono text-[10px] tracking-[0.14em] uppercase",
              matches.length === 0
                ? "text-[color:var(--color-fg-faint)]"
                : "text-[color:var(--color-fg-dim)] hover:bg-[color:var(--color-foil)]/15 hover:text-[color:var(--color-foil)]",
            )}
          >
            Replace
          </button>
          <button
            disabled={matches.length === 0}
            onClick={replaceAll}
            className={cn(
              "rounded-full px-2 py-0.5 font-mono text-[10px] tracking-[0.14em] uppercase",
              matches.length === 0
                ? "text-[color:var(--color-fg-faint)]"
                : "bg-[color:var(--color-foil)]/15 text-[color:var(--color-foil)] hover:bg-[color:var(--color-foil)]/25",
            )}
          >
            Replace all
          </button>
        </div>
      )}
    </div>
  );
}

function Toggle({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded px-1.5 py-0.5 font-mono text-[10px] tracking-[0.14em] uppercase",
        active
          ? "bg-[color:var(--color-foil)]/15 text-[color:var(--color-foil)]"
          : "text-[color:var(--color-fg-dim)] hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `pnpm tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/EditorFindBar.tsx
git commit -m "feat(editor): in-file find/replace bar

Inline bar driven by EditorHandle. Current-match highlight is the
textarea's native selection — Enter / Shift+Enter cycle, the editor
scrolls to centre the match. Replace acts on the active selection;
Replace all confirms then runs a single regex replace so Cmd+Z
undoes the entire batch in one step. Shares option state with the
folder-wide panel via the same localStorage key."
```

---

### Task 3.3: Mount the find bar inside `Editor.tsx` and bind shortcuts

**Files:**
- Modify: `src/components/Editor.tsx`
- Modify: `src/components/Workspace.tsx`

- [ ] **Step 1: Mount the bar inside the editor**

In `src/components/Editor.tsx`:

1. Add the import:

```tsx
import { EditorFindBar } from "@/components/EditorFindBar";
```

2. Inside the component body, after the `useImperativeHandle` block, add:

```tsx
  const [findOpen, setFindOpen] = useState(false);
  const [findMode, setFindMode] = useState<"find" | "replace">("find");

  // Cmd+F / Cmd+Option+F / Cmd+H from the editor itself.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    function onKey(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      if (e.key.toLowerCase() === "f" && !e.shiftKey) {
        e.preventDefault();
        setFindMode(e.altKey ? "replace" : "find");
        setFindOpen(true);
      } else if (e.key.toLowerCase() === "h") {
        e.preventDefault();
        setFindMode("replace");
        setFindOpen(true);
      }
    }
    el.addEventListener("keydown", onKey);
    return () => el.removeEventListener("keydown", onKey);
  }, [path]);
```

3. Replace the existing `useImperativeHandle(...)` block (added in task 3.1) with this version that also writes the handle into an internal ref the find bar can consume directly:

```tsx
  const internalRef = useRef<EditorHandle | null>(null);
  useImperativeHandle(
    ref,
    (): EditorHandle => {
      const handle: EditorHandle = {
        getText: () => textareaRef.current?.value ?? "",
        setText: (text) => {
          const el = textareaRef.current;
          if (!el) return;
          el.value = text;
          setLiveValue(text);
          onChange(text);
        },
        insertAtSelection: (text) => {
          const el = textareaRef.current;
          if (!el) return false;
          el.focus();
          const ok = document.execCommand("insertText", false, text);
          if (ok) {
            setLiveValue(el.value);
            onChange(el.value);
          }
          return ok;
        },
        getSelection: () => {
          const el = textareaRef.current;
          if (!el) return { start: 0, end: 0 };
          return { start: el.selectionStart, end: el.selectionEnd };
        },
        setSelection: (start, end, scrollIntoView = true) => {
          const el = textareaRef.current;
          if (!el) return;
          el.focus();
          el.setSelectionRange(start, end);
          if (scrollIntoView) {
            const before = el.value.slice(0, start);
            const line = before.split("\n").length - 1;
            const lh = parseFloat(getComputedStyle(el).lineHeight) || 24;
            el.scrollTop = Math.max(0, line * lh - el.clientHeight / 2);
          }
        },
        focusEditor: () => textareaRef.current?.focus(),
      };
      internalRef.current = handle;
      return handle;
    },
    [onChange],
  );
```

4. Inside the JSX, immediately INSIDE the outer `<div className={cn("relative flex h-full ...")}>` (before the `{!focus && (` block), render the bar:

```tsx
      <EditorFindBar
        editorRef={internalRef}
        open={findOpen}
        initialMode={findMode}
        onClose={() => setFindOpen(false)}
        onTextChanged={() => {
          /* setText already calls onChange — nothing extra. */
        }}
      />
```

- [ ] **Step 2: Add palette entries in Workspace**

In `src/components/Workspace.tsx`, inside the `commands` useMemo, inside the `if (t.activeTab) { ... }` block (where Save and Close tab live), append:

```tsx
      list.push({
        id: "find-in-file",
        category: "Editor",
        label: "Find in file…",
        shortcut: "⌘ F",
        icon: Search,
        keywords: ["search"],
        // Dispatch a synthetic keydown so the editor's own handler picks it up.
        run: () => {
          const ev = new KeyboardEvent("keydown", { key: "f", metaKey: true, bubbles: true });
          (document.activeElement ?? document.body).dispatchEvent(ev);
        },
      });
      list.push({
        id: "replace-in-file",
        category: "Editor",
        label: "Replace in file…",
        shortcut: "⌘ ⌥ F",
        icon: Replace,
        keywords: ["substitute"],
        run: () => {
          const ev = new KeyboardEvent("keydown", {
            key: "f",
            metaKey: true,
            altKey: true,
            bubbles: true,
          });
          (document.activeElement ?? document.body).dispatchEvent(ev);
        },
      });
```

- [ ] **Step 3: Verify it type-checks and builds**

Run: `pnpm tsc --noEmit && pnpm build`
Expected: clean.

- [ ] **Step 4: Ask the user to smoke test**

Hand the user:

1. Open a file with the word "the" several times. Cmd+F → bar slides in, "1 of N" reflects total occurrences, the first match is selected.
2. Enter cycles forward through matches; Shift+Enter cycles back; each match is scrolled to centre.
3. Esc closes the bar and restores the selection to where the cursor was when you pressed Cmd+F.
4. Cmd+Option+F → bar opens with the replace row visible. Replace once → that match is replaced and the next is highlighted. Replace all → confirm dialog, all matches replaced.
5. Cmd+Z immediately after Replace all → entire batch undone in one step.
6. Make sure the case/regex/whole-word toggles in this bar share state with the folder-wide panel (open Cmd+Shift+F, toggle regex on, close, then Cmd+F — regex should still be on).

- [ ] **Step 5: Commit**

```bash
git add src/components/Editor.tsx src/components/Workspace.tsx
git commit -m "feat(editor): mount EditorFindBar with Cmd+F / Cmd+Option+F / Cmd+H

Find bar lives inside the editor pane so its 'absolute top-0' anchor
sits at the right place even in split view. Palette entries dispatch
synthetic keydowns so the editor's own handler stays the single
source of truth for the keybinding."
```

---

## End-of-plan checklist

- [ ] All three phases committed.
- [ ] `pnpm tsc --noEmit && pnpm build` runs clean from a fresh checkout.
- [ ] `cd src-tauri && cargo check` runs clean.
- [ ] The manual smoke lists in tasks 1.6, 2.5, and 3.3 all pass.
- [ ] The polling block previously at `src/hooks/useTabs.ts:194-234` is gone (grep for `WATCH_INTERVAL_MS` to confirm).
- [ ] `regex` is the only new Rust dep. No new JS deps (`@tauri-apps/plugin-fs` was already present).

If any of those fail, fix before declaring the work shipped.
