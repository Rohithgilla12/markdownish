# Markdownish

A personal, no-fluff markdown editor and viewer. Open a folder, see the markdown files, edit them with a split live preview. That's it.

## Why this exists

I work a lot with agentic coding tools (Claude Code, Cursor agents, etc.), which means I'm constantly editing markdown files — `CLAUDE.md`, `AGENTS.md`, `SKILL.md`, specs, plans, PRDs. Opening a full IDE (`code .`, `cursor .`, `zed .`) just to tweak a markdown file is overkill. This is a tiny purpose-built tool for that workflow.

**Scope is deliberately small.** Resist the urge to add features that already exist in Obsidian, Typora, or your IDE. This is single-user, single-purpose, opinionated.

## Stack

- **Tauri 2** (Rust shell, native WebView — small binary, fast cold start)
- **React + TypeScript + Vite** (frontend)
- **Tailwind CSS + shadcn/ui** (styling and components — match my usual stack)
- **pnpm** (package manager)
- **Node 22 LTS, Rust stable**

Target: macOS first (my primary platform). Don't bother with code signing, notarization, auto-update, CI builds, or Windows/Linux polish — this is for me. Build artifacts go in `src-tauri/target/release/bundle/macos/`.

## Core features (v1 — must have)

1. **Open a folder** — via file dialog or via CLI argument when launched from terminal.
2. **Sidebar file tree** — recursive, filtered to `.md`, `.mdx`, and `.markdown` files only. Show folder structure. Collapsed by default for deep trees.
3. **Pinned files at the top of the sidebar** — auto-detect and pin: `CLAUDE.md`, `AGENTS.md`, `SKILL.md`, `README.md`, `PRODUCT.md`, `DESIGN.md`. Render them above the rest of the tree in a "Pinned" section, in the order listed.
4. **Split live preview** — editor on the left, rendered preview on the right. Synchronized scroll. Toggleable: editor-only, preview-only, split (default).
5. **Editing**
   - Plain textarea-style editor with monospace font (no fancy CodeMirror plugins for v1 — keep it simple)
   - `Cmd+S` saves
   - Auto-save on blur after 2-second debounce as a safety net (but show "unsaved" indicator until explicit save)
   - Show unsaved-changes indicator in the tab/title
6. **Markdown rendering** — use `react-markdown` with these plugins:
   - `remark-gfm` — tables, strikethrough, task lists, autolinks
   - `remark-emoji` — `:smile:` → 😄
   - `rehype-highlight` or `rehype-shiki` — code block syntax highlighting (prefer Shiki for nicer themes)
   - `rehype-slug` + `rehype-autolink-headings` — anchor links on headings
7. **Frontmatter** — parse YAML frontmatter and render it as a clean card above the rendered body in the preview pane. Don't strip it from the source.
8. **File watching** — if the open file changes on disk (e.g. Claude Code writes to it), prompt to reload. Don't auto-clobber unsaved changes.
9. **Launch with a path argument** — `markdownish /path/to/folder` opens that folder on startup. This is the killer feature: combined with a shell alias (`md() { open -a Markdownish "${1:-.}" }`), it gives me `md .` from any project.

## Non-goals for v1

Resist all of these. If I want them later, I'll say so:

- Vim mode, keybindings beyond basics
- Multi-tab / multi-pane editing
- Git integration, diff view
- Themes / theme switcher (just ship one good dark theme — I'll add light later if I miss it)
- Plugin system
- Cloud sync, settings sync
- Search across files
- Export to PDF / HTML
- Mermaid, math (KaTeX), or other heavy plugins (add later if I actually reach for them)
- Image paste / drag-and-drop
- Outline / table-of-contents sidebar
- Windows / Linux builds
- Code signing, auto-update

If you find yourself reaching for one of these, stop and ask.

## Design direction

Match Blocktree-adjacent aesthetics — clean, modern, restrained. Use Tailwind defaults with shadcn/ui components. Dark theme as default. Typography should be the centerpiece: **the rendered preview should look genuinely pleasant to read**.

- Editor font: a good monospace — JetBrains Mono, Geist Mono, or system mono fallback
- Preview body font: a quality sans-serif (Inter is fine, or system UI font)
- Preview heading font: same as body — don't get cute with serif heroes
- Code block theme: a calm Shiki theme like `github-dark-dimmed` or `vitesse-dark`
- Generous line height (1.6+) and max-width (~70ch) for the preview pane

Apply the `frontend-design` and `blocktree-brand-guideline` skills if available when building UI.

## Project structure

```
markdownish/
├── src/                          # React frontend
│   ├── components/
│   │   ├── ui/                   # shadcn primitives
│   │   ├── FileTree.tsx
│   │   ├── Editor.tsx
│   │   ├── Preview.tsx
│   │   ├── FrontmatterCard.tsx
│   │   └── SplitView.tsx
│   ├── hooks/
│   │   ├── useFile.ts
│   │   ├── useFolder.ts
│   │   └── useFileWatcher.ts
│   ├── lib/
│   │   ├── markdown.ts           # react-markdown setup
│   │   └── frontmatter.ts        # gray-matter wrapper
│   ├── App.tsx
│   └── main.tsx
├── src-tauri/
│   ├── src/
│   │   ├── main.rs
│   │   └── commands.rs           # fs commands, path arg parsing
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   └── capabilities/
│       └── default.json          # fs + dialog permissions
├── package.json
├── pnpm-lock.yaml
└── README.md
```

## Tauri capabilities (permissions)

Scope tightly — don't grant `fs:default` or `*`. Need:

- `dialog:allow-open` — folder picker
- `fs:allow-read-text-file`, `fs:allow-write-text-file` — read/write `.md` files
- `fs:allow-read-dir` — list folder contents
- `fs:scope` — limited to the user-selected folder at runtime (not a static path)
- File watcher permissions for the chosen folder

Use the Tauri plugins: `tauri-plugin-fs`, `tauri-plugin-dialog`, `tauri-plugin-cli` (for the path argument).

## Key implementation notes

### Launch with path argument

Use `tauri-plugin-cli` to read positional args on startup. In `main.rs`:

```rust
// Pseudocode — verify against current tauri-plugin-cli docs before writing
let matches = app.cli().matches()?;
if let Some(path_arg) = matches.args.get("path") {
    // emit to frontend on ready: open this folder
}
```

Define the arg in `tauri.conf.json` under the `cli` plugin config. Emit an event to the frontend (`open-folder`) with the resolved absolute path once the window is ready.

### Shell wrapper

After build, the app lives at `/Applications/Markdownish.app` (after I drag it there). Add this to my `~/.zshrc`:

```bash
md() {
  open -a "Markdownish" "${1:-$(pwd)}"
}
```

For `open -a` to pass the path to the app, the app needs to accept a file/folder URL via macOS's `application:openURLs:` (Tauri 2 fires the `RunEvent::Opened` event for this). Wire that up in `main.rs` too — that's the more reliable path on macOS than CLI args.

### File watching

Use `tauri-plugin-fs-watch` or the `notify` crate via a custom command. Debounce events (200ms) to avoid spam from editor saves.

### Synchronized scroll

Map source-line → rendered-element using the `data-sourcepos` attribute that `remark-gfm` can add (or compute manually from heading offsets). For v1, a simple percent-based sync is fine — match scroll percentage between panes.

### Frontmatter

Parse with `gray-matter` on the frontend. Render the YAML object as a small card with key-value pairs above the rendered body. Keep the raw frontmatter in the editor source.

## Build instructions for Claude Code

Work in this order. Don't skip ahead. Show me each phase before moving on.

### Phase 1 — Scaffold

```bash
pnpm create tauri-app
# Project name: markdownish
# Identifier: dev.gilla.markdownish
# Language: TypeScript / JavaScript (pnpm)
# Package manager: pnpm
# UI template: React
# UI flavor: TypeScript
```

Then add Tailwind, shadcn/ui, and the Tauri plugins listed above. Confirm `pnpm tauri dev` opens a window.

### Phase 2 — Folder open + file tree

Wire up the dialog plugin, open a folder, list `.md` files in a sidebar with shadcn's tree-ish styling. No editor yet. Pinned files section at the top.

### Phase 3 — Editor + save

Click a file in the sidebar → load contents into a `<textarea>` (or `contenteditable` — your call, but keep it simple). Cmd+S writes back to disk via `fs:allow-write-text-file`.

### Phase 4 — Preview pane + plugins

Add `react-markdown` with GFM, emoji, Shiki, slug, autolink-headings. Render in the right pane. Split layout via a simple flex container — don't reach for a draggable splitter library for v1.

### Phase 5 — Frontmatter card

Parse with `gray-matter`. Render as a card at the top of the preview pane.

### Phase 6 — Launch arg + macOS open URL

Wire `tauri-plugin-cli` and `RunEvent::Opened`. Test: `open -a Markdownish ~/some-folder` should open that folder. Add the `md` shell function to `.zshrc` documentation in the README.

### Phase 7 — File watching

When the open file changes on disk and there are no unsaved changes, reload silently. If there are unsaved changes, show a toast asking what to do.

### Phase 8 — Polish

- Sensible empty state when no folder is open
- Recent folders list (last 5) in localStorage
- Keyboard shortcuts cheatsheet (just Cmd+S, Cmd+P for quick open, Cmd+\ to toggle preview)
- Hide files and folders starting with `.` in the tree
- Respect `.gitignore` (nice to have — skip if it adds complexity)

### Phase 9 — Build

```bash
pnpm tauri build
```

Confirm the `.dmg` works, drag to `/Applications`, restart, verify `md .` from terminal works end-to-end.

## When in doubt

- Prefer fewer features over more
- Prefer fewer dependencies over more
- Prefer obvious code over clever code
- Single-file components are fine until they aren't
- No tests for v1 — I'll add them later if this thing actually sticks

## Open questions to confirm before I start

1. Confirm the exact list of Tauri plugins needed against current docs before installing (versions change).
2. Verify `tauri-plugin-cli` is still the right way to read CLI args in Tauri 2 stable as of May 2026.
3. Confirm `react-markdown` + `remark-gfm` + Shiki integration pattern still works the same way.
