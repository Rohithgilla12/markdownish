---
title: File Watcher & Search
date: 2026-05-19
status: approved
---

# File Watcher & Search

Two features for Markdownish, designed together because they share infrastructure (Tauri commands, event plumbing) and because search-and-replace needs the watcher's self-write suppression to behave well.

## Scope

**In scope**

- Event-driven file watcher covering the open folder (recursive) and all open tabs
- Tree auto-refresh on external add/remove/rename of `.md`/`.mdx`/`.markdown` files
- Per-tab reaction to external modify (silent reload or conflict toast) and external delete (silent close if clean, banner if dirty)
- Full-text search-and-replace panel across the open folder (Cmd+Shift+F)
- In-file find-and-replace bar in the editor (Cmd+F / Cmd+Option+F)
- Self-write suppression so our own saves don't trigger watcher reactions

**Out of scope**

- Search across closed folders or system-wide
- Search inside non-markdown files
- Rename-following (a rename is treated as delete + create)
- Undo of replace-all (rely on disk-level recovery; Cmd+Z within the editor still works for in-file replace)
- Cross-file regex backreferences with capture groups in replace-all (v1.5 supports plain text and basic regex; capture references can come later if used)
- `.gitignore` honouring — the search uses the same filter set as the sidebar (hidden files, `node_modules`, `target`, `dist`, `build`). `.gitignore` parsing remains the nice-to-have it was in v1.

## UX

### Cmd+Shift+F — Find & Replace panel (folder-wide)

A modal panel, sibling to QuickOpen, opened with **Cmd+Shift+F**.

Layout, top to bottom:

```
┌─────────────────────────────────────────────────────────────┐
│ 🔍  query text..............................   .Aa .* .\b  │
│ ↪   replace text...........................                │
│                                            [Replace all]   │
├─────────────────────────────────────────────────────────────┤
│ ▾ docs/spec.md                           3 matches         │
│   12  …the **FSX-2357** ticket covers…       [replace]     │
│   34  …related to FSX-2357 indexes…          [replace]     │
│   88  …FSX-2357 follow-up tasks…             [replace]     │
│ ▾ CLAUDE.md                              1 match           │
│   17  …# Index Recommendations for FSX-2357  [replace]     │
└─────────────────────────────────────────────────────────────┘
```

- **Query** input is focused on open. Typing triggers a search after a 150ms debounce; previous in-flight searches are cancelled.
- Toggles (right of query): **Aa** (case sensitive), **.*** (regex), **\b** (whole word). State persists in `localStorage`.
- **Replace** input is always visible. Empty replace + Replace-all = delete matches.
- Results: grouped by file, file row collapsible, max 200 matches per file (with "+N more" indicator), max 50 files shown (with "+N more" indicator).
- **Click a match row** → close panel, open that file in a tab, scroll/select the match.
- **Per-match Replace button** → apply just that one replacement, file is saved, the match disappears from the results list.
- **Replace all** → confirm dialog ("Replace 17 matches across 4 files?"), then apply across every visible match. Files are written through the new `replace_in_files` command. Toast on completion: "Replaced 17 matches in 4 files."
- **Esc** closes. **Cmd+Enter** runs Replace all.
- Results show line number + a single-line snippet centred on the match with the match itself highlighted via the foil colour.

### Cmd+F — Find bar inside the editor (current file)

An inline bar that slides down from the top of the editor pane.

```
┌─────────────────────────────────────────────────────────────┐
│ 🔍 query........  .Aa .* .\b   3 of 17   ↑ ↓   ✕           │
│ ↪  replace.....   [Replace]  [Replace all]                 │
└─────────────────────────────────────────────────────────────┘
```

- **Cmd+F** opens with the find row only (replace row hidden), query focused. If text is selected in the editor, it preseeds the query.
- **Cmd+Option+F** (and **Cmd+H**) opens with the replace row also visible.
- **Enter / F3** → next match. **Shift+Enter / Shift+F3** → previous. Both cycle with wrap.
- "Current match" = the textarea's `setSelectionRange` selection. The native browser selection IS the highlight. No overlay, no editor surgery. (This is the deliberate trade-off for keeping the textarea: we get one highlight, not all-matches-highlighted. Acceptable for v1.5.)
- Match count "3 of 17" updates live with debounce.
- **Replace** acts on the current selection only — replaces it, advances to next match.
- **Replace all** confirms ("Replace 17 matches in this file?"), applies, marks tab dirty (does **not** auto-save; user still hits Cmd+S to commit). This way regretful Cmd+Z still recovers via the editor's native undo.
- Toggles share state with the folder-wide panel via `localStorage`.
- **Esc** closes, restoring the editor selection to where the user started.

### File watcher behaviour

Triggered by any filesystem event in the open folder tree.

- **Modify** (`.md`/`.mdx`/`.markdown` file):
  - If open in a tab: if the tab is clean, silently reload content + update mtime. If dirty, attach the new content/mtime to `tab.conflict` and show the existing `ConflictToast` (Keep / Reload).
  - If not open in a tab: ignore (tree doesn't care about content).
- **Create** (markdown file): re-walk the tree and refresh the sidebar. No tab side-effects.
- **Remove** (markdown file):
  - If open in a tab and clean: close the tab silently.
  - If open in a tab and dirty: show a tab-level banner ("This file was deleted on disk. Save to recreate it, or close the tab.") with `[Save] [Close]` actions. Banner reuses the `ConflictToast` visual treatment, scoped to the tab.
  - In all cases: re-walk the tree.
- **Rename**: treated as Remove(old) + Create(new). Open tabs on the old path get the deletion flow. No attempt to follow the rename automatically.
- **Other extensions / hidden files / `node_modules` etc.**: ignored at the dispatcher.
- **Self-writes**: any event whose `path + mtime` matches a recent self-write (last 32 entries, 5 second TTL) is dropped before dispatch. This kills the loop where our own `Cmd+S` would trigger a "file changed" prompt.

The existing 800ms polling in `useTabs.ts:194-234` is **removed** as part of this work — the event watcher replaces it.

## Architecture

### Rust (`src-tauri/`)

Add one dependency:

```toml
regex = "1"
```

`tauri-plugin-fs` (already present) ships the `watch` API; no other plugin needed. Tauri 2 capabilities will need `fs:allow-watch` added.

New commands in `commands.rs`:

```rust
// Folder-wide search. Walks the folder, opens each markdown file once,
// returns matches grouped by file. Honours the same walk filters as
// read_tree (hidden files / node_modules / target / dist / build skipped).
//
// Cancellable via request_id: the frontend passes a monotonic id, the
// command writes its id into a Mutex<u64>, and at each file boundary
// it checks whether a newer id has superseded it — bails out if so.
#[tauri::command]
pub fn search_folder(
    folder: String,
    query: String,
    opts: SearchOpts,
    request_id: u64,
    state: State<SearchState>,
) -> Result<SearchResult, String>;

pub struct SearchOpts {
    pub case_sensitive: bool,
    pub regex: bool,
    pub whole_word: bool,
}

pub struct SearchResult {
    pub files: Vec<FileMatches>,
    pub truncated_files: bool, // more than 50 files matched
}

pub struct FileMatches {
    pub path: String,
    pub mtime: u128,
    pub matches: Vec<Match>,
    pub truncated: bool, // more than 200 matches in this file
}

pub struct Match {
    pub line: u32,      // 1-indexed
    pub col: u32,       // 1-indexed, UTF-16 code units (textarea-friendly)
    pub offset: u32,    // byte offset for replace; converted to char offset on JS side
    pub length: u32,    // bytes
    pub snippet: String,         // one line, ~120 chars centred on match
    pub snippet_match_start: u32, // offset within snippet (UTF-16 units)
    pub snippet_match_end: u32,
}
```

```rust
// Apply replacements to one or more files. Returns per-file outcomes.
// Each file's replacements MUST be sorted by offset descending so they
// can be applied without reindexing. Files are written atomically
// (write to <path>.tmp, rename over). Self-writes are recorded in
// SuppressionState so the watcher ignores them.
#[tauri::command]
pub fn replace_in_files(
    edits: Vec<FileEdit>,
    state: State<SuppressionState>,
) -> Result<Vec<ReplaceOutcome>, String>;

pub struct FileEdit {
    pub path: String,
    pub expected_mtime: u128, // refuse if disk mtime differs
    pub replacements: Vec<Replacement>, // sorted by offset descending
}

pub struct Replacement {
    pub offset: u32, // bytes
    pub length: u32, // bytes
    pub text: String,
}

pub enum ReplaceOutcome {
    Ok { path: String, new_mtime: u128, replaced: u32 },
    StaleMtime { path: String, actual_mtime: u128 },
    IoError { path: String, message: String },
}
```

State setup in `lib.rs`:

```rust
struct SuppressionState(Mutex<VecDeque<(String, u128, Instant)>>); // path, mtime, recorded_at
struct SearchState(Mutex<u64>); // latest accepted request_id
```

`write_text_file` and `create_text_file` push into `SuppressionState` after a successful write. `SuppressionState` evicts entries older than 5 seconds.

The watcher itself lives entirely on the JS side via `@tauri-apps/plugin-fs`'s `watch` — no Rust glue needed beyond exposing the suppression state through a small read-side helper:

```rust
// Returns true if the (path, mtime) pair matches a recent self-write
// recorded in the last 5 seconds. The frontend calls this before
// reacting to a watcher event.
#[tauri::command]
pub fn is_self_write(
    path: String,
    mtime: u128,
    state: State<SuppressionState>,
) -> bool;
```

### Frontend (`src/`)

**New hook: `src/hooks/useFolderWatcher.ts`**

```ts
type WatcherEvent =
  | { kind: "create"; path: string; mtime: number }
  | { kind: "modify"; path: string; mtime: number }
  | { kind: "remove"; path: string };

export function useFolderWatcher(folder: string | null, onEvent: (ev: WatcherEvent) => void): void;
```

Internals:

- On mount (or folder change), call `watch(folder, handler, { recursive: true, delayMs: 200 })` from `@tauri-apps/plugin-fs`.
- Map plugin event types to our `WatcherEvent`. Filter to `.md`/`.mdx`/`.markdown` and to paths not under `node_modules`/`target`/`dist`/`build`/dotfiles.
- For modify/create, fetch `mtime` via `stat_mtime`. Skip the event if `is_self_write(path, mtime)` returns true.
- Coalesce duplicate events for the same path within a 200ms window.
- Tear down the watcher on unmount or folder change.

**New hook: `src/hooks/useFolderSearch.ts`**

```ts
type SearchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; results: SearchResult; query: string }
  | { status: "error"; message: string };

export function useFolderSearch(folder: string | null): {
  state: SearchState;
  query: string;
  opts: SearchOpts;
  setQuery: (q: string) => void;
  setOpts: (o: SearchOpts) => void;
  replace: (edits: FileEdit[]) => Promise<ReplaceOutcome[]>;
};
```

Internals: 150ms debounce on query change, monotonically increasing request_id, drops responses for stale ids.

**New components:**

- `src/components/FindReplacePanel.tsx` — the Cmd+Shift+F modal. Mirrors `QuickOpen.tsx`'s shell (overlay + centred card) and styling.
- `src/components/EditorFindBar.tsx` — the inline Cmd+F bar. Owns its own visibility, query state, and replace state. Talks to the editor through a small imperative ref:

```ts
// Added to Editor.tsx
export interface EditorHandle {
  getText(): string;
  setText(text: string): void;
  getSelection(): { start: number; end: number };
  setSelection(start: number, end: number, scroll?: boolean): void;
  focusEditor(): void;
}
```

The bar uses `getText` to compute match ranges, `setSelection` to highlight the current match, and `setText` to apply replacements.

- `src/components/TabDeletedBanner.tsx` — the per-tab "deleted on disk" banner with `[Save] [Close]` actions.

**Modified files:**

- `src/components/Editor.tsx` — expose `EditorHandle` via `forwardRef`; embed `EditorFindBar` and wire Cmd+F / Cmd+Option+F / Cmd+H keybindings.
- `src/hooks/useTabs.ts` — remove the polling effect (`useEffect` at lines 194-234). Add a new `Tab.deleted: boolean` field and an `applyExternalEvent(event: WatcherEvent)` method that the `Workspace` calls from the watcher's `onEvent`.
- `src/components/Workspace.tsx` — mount `useFolderWatcher(folder, dispatchEvent)`. The dispatcher routes events to (a) tree refresh via `useFolder`, (b) `useTabs.applyExternalEvent`. Open the find/replace panel on Cmd+Shift+F.
- `src/components/CommandPalette.tsx` — add "Find in files…" and "Find in current file…" commands.
- `src-tauri/capabilities/default.json` — add `fs:allow-watch` and `fs:allow-stat` (if not present).
- `src-tauri/Cargo.toml` — add `regex = "1"`.
- `src-tauri/src/lib.rs` — register `SuppressionState`, `SearchState`, and the new commands.

## Data flow

### Folder-wide replace-all (representative path)

1. User types in the panel → `useFolderSearch` debounces and calls `invoke('search_folder', { folder, query, opts, request_id })`.
2. Rust walks the folder, builds `SearchResult`, returns. Stale request_ids are dropped.
3. User clicks **Replace all**. Frontend builds `FileEdit[]` from current results, sorts each file's replacements by offset descending, calls `invoke('replace_in_files', { edits })`.
4. Rust validates `expected_mtime` per file. For each surviving file: applies replacements bottom-up to the in-memory string, writes atomically, records `(path, new_mtime)` in `SuppressionState`, returns the new mtime.
5. Frontend re-runs the search to refresh results, surfaces any `StaleMtime` failures as per-file warnings.
6. The watcher receives modify events for the rewritten files. For each one it calls `is_self_write(path, mtime)` and skips them — open tabs do not flash a conflict toast.

### External delete of an open file (representative path)

1. User deletes `docs/spec.md` in Finder while it's open in a tab.
2. Watcher fires `{ kind: "remove", path }` (after the 200ms coalescing window).
3. `useTabs.applyExternalEvent` finds the matching tab.
4. If clean: closes the tab via the existing close path.
5. If dirty: sets `tab.deleted = true`. The tab renders `TabDeletedBanner` above the editor. `[Save]` calls `create_text_file` to recreate it; `[Close]` closes the tab (discarding edits, after a confirm).

## Error handling

- **Watcher fails to start** (permissions, plugin error): log to console, fall back to a single-shot tree refresh on window-focus. No user-facing nag — these are rare and recoverable.
- **search_folder hits a file it can't read**: skip the file, include it in `SearchResult.skipped: string[]` if the count is small; otherwise silently skip. Don't fail the whole search.
- **Regex compile error**: return `Err("Invalid regex: ...")` from the command; panel shows the message under the query input in the foil colour.
- **replace_in_files StaleMtime**: per-file warning in the results panel ("file changed since last search — refresh and try again"). The successful files still go through.
- **replace_in_files IoError**: per-file error toast, but other files in the batch still succeed.
- **Cmd+F replace on no current match**: no-op; the button is disabled when the textarea selection doesn't match the query.

## Performance

- Search walks the tree synchronously inside the command. For a folder with 1,000 markdown files averaging 5KB each (~5MB), expect <100ms cold and <30ms warm (page cache). If we ever see folders large enough that this matters, we add a `tokio::task::spawn_blocking` wrapper, but YAGNI for v1.5.
- The watcher's 200ms event coalescing keeps editor-save bursts from spamming the frontend.
- Self-write suppression eviction is O(1) amortised — only checked on insert.
- The find bar's match recomputation is O(n) over the current file content per keystroke; for files up to a few hundred KB this is imperceptible.

## Testing

No automated tests for v1.5 (per project convention). Manual smoke list:

1. Folder open, edit `CLAUDE.md` in Markdownish, Cmd+S → no conflict toast (self-write suppressed).
2. Folder open, `echo "x" >> CLAUDE.md` from terminal while CLAUDE.md is the active tab and clean → silent reload.
3. Same but with unsaved edits → conflict toast.
4. Create a new `.md` in the folder from terminal → it appears in the sidebar within ~250ms.
5. Delete an open-but-clean tab's file from terminal → tab disappears.
6. Delete an open-and-dirty tab's file from terminal → banner appears, Save recreates the file.
7. Cmd+Shift+F, type "FSX-2357", verify matches appear; click one, verify the file opens and the match is selected.
8. Same panel, type a replacement, Replace all, verify all files updated and no conflict toasts fired.
9. Cmd+F in editor, type a query, Enter cycles matches.
10. Cmd+Option+F, replace + Replace all in current file; verify tab is dirty and Cmd+Z undoes the entire replace-all in one step.
11. Rename a watched file from terminal → old tab gets deletion treatment, new file appears in tree.

## Phasing

Three commits, in order:

1. **Watcher backbone** — Rust suppression state, `is_self_write` command, `useFolderWatcher` hook, wire into `useTabs` and tree refresh. Remove the polling code. (Independently shippable.)
2. **Folder search panel** — `search_folder` + `replace_in_files` commands, `useFolderSearch`, `FindReplacePanel`, Cmd+Shift+F binding, palette entry.
3. **In-file find/replace bar** — `EditorHandle` ref API on `Editor.tsx`, `EditorFindBar` component, Cmd+F / Cmd+Option+F / Cmd+H bindings, palette entry.

Each step is independently usable. If we stop after step 1, the app still has the watcher upgrade. If we stop after step 2, the in-file search just isn't there yet.
