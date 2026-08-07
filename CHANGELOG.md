# Changelog

All notable changes to Markdownish are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project
uses [semantic versioning](https://semver.org/). Each release ships a signed,
notarized Apple Silicon build; the in-app updater offers it on next launch.

## [0.1.20] — 2026-08-07

Quick open goes folder-wide, completing the finder trio: `⌘P` for file
names, `⌘K` for file contents, `⌘⇧P` for commands.

### Changed

- **Quick open (`⌘P`)** now fuzzy-finds across *every* file in the folder,
  not just the markdown tree — backed by a new `list_files` command that
  walks with the same hidden-file and junk-directory skip rules as the
  search walkers (capped at 5 000 entries). Non-markdown files open as
  plain text in the editor.

## [0.1.19] — 2026-08-06

Live grep lands on `⌘K` — the folder-wide content search the muscle memory
always reached for.

### Added

- **Live grep** — `⌘K` opens a Telescope-style search over every markdown
  file's contents. Results update as you type, each row shows the matched
  line with the hit highlighted plus its file and line number; `↑↓` (or
  `Ctrl+N` / `Ctrl+P`) to move, `Enter` jumps straight to the match in the
  editor. Also runnable from the command palette as "Search in files…".
- **Sidebar refresh** — a manual refresh button next to "New file" re-reads
  the folder tree on demand.
- **Agent rule files** — `.cursorrules` and `.windsurfrules` are now treated
  as markdown and pinned at the top of the sidebar alongside `CLAUDE.md`.
- **File associations** — the macOS bundle registers itself as an editor for
  `.md`, `.mdx`, and `.markdown`, so "Open With → Markdownish" works from
  Finder.

### Changed

- **Command palette** moved from `⌘K` to `⌘⇧P` (VS Code convention) to make
  room for live grep. The shortcuts cheatsheet reflects the new bindings.

## [0.1.18] — 2026-06-19

The biggest release since the initial build: live file watching, full-folder
search, a math/outline/stats/export feature set, and a real test suite.

### Added

- **File watching** — a single recursive watcher over the open folder. External
  edits (e.g. an agent writing to `CLAUDE.md`) reload silently when you have no
  unsaved changes, and prompt you when you do. Deleted open files surface a banner.
- **Search & replace** — `⌘⇧F` searches every markdown file in the folder with
  match navigation and replace; `⌘F` / `⌘⌥F` find-and-replace within the current file.
- **Math** — `$inline$` and `$$block$$` LaTeX render with KaTeX in both the split
  preview and Reading Mode.
- **Outline** — `⌘⇧O` toggles a docked table of contents built from the document's
  headings. Click an entry to jump — it scrolls the preview, or the editor line
  when the preview is hidden.
- **Document stats** — a status strip under the editor shows live word count,
  reading time, and paragraph count.
- **Export** — send the current document to PDF (via the print panel), a standalone
  HTML file, a PNG of the preview, or an EPUB for e-readers.
- **Tests** — Vitest unit coverage for hooks, components, and libs, plus a
  Playwright end-to-end suite driving the app with the Tauri IPC layer mocked.

### Fixed

- The editor footer no longer double-counts words now that the status bar owns
  document stats; it keeps cursor position and encoding.
- `EditorHandle` is populated unconditionally, and programmatic `setSelection`
  no longer steals focus from the editor.

### Changed

- Export code (`react-dom/server`, `html-to-image`, `fflate`) is lazy-loaded on
  first export, keeping it out of the main bundle so cold start stays fast.

## [0.1.17] — 2026-05-15

### Added

- Typewriter focus mode (`⌘.`) — centred writing column with an ambient fade.

## [0.1.16] — 2026-05-15

### Added

- Command palette (`⌘K`) — every shortcut and action made searchable.

## [0.1.15] — 2026-05-15

### Added

- App icon — an italic **M** with a foil period on a walnut squircle.

## [0.1.14] — 2026-05-14

### Fixed

- Recent-folders list normalises paths to dedupe near-identical entries.

## [0.1.13] — 2026-05-14

### Added

- Tokyo Night and Catppuccin themes.
- New-file creation from the sidebar.

## [0.1.12] — 2026-05-14

### Fixed

- Switched the editor textarea to uncontrolled — React 19 + WKWebView wouldn't
  fire `onChange` reliably.

## [0.1.11] — 2026-05-14

### Fixed

- Scroll sync made reliable; the slash-menu trigger is now more conservative.

## [0.1.10] — 2026-05-14

### Fixed

- Manual update check (`⌘U`); update banner repositioned above the editor footer.

## [0.1.9] — 2026-05-14

### Added

- Synchronized scroll between editor and preview.
- Slash-menu snippets in the editor.

## [0.1.8] — 2026-05-14

### Fixed

- Render raw HTML embedded in markdown (centred blocks, badges) and resolve
  local relative image paths.

## [0.1.7] — 2026-05-14

### Added

- Reading Mode (`⌘R`) with View Transitions — centred prose, outline gutter,
  scroll-progress hairline.

## [0.1.6] — 2026-05-14

### Fixed

- Version label reads from `package.json` at build time.

## [0.1.5] — 2026-05-14

### Fixed

- Dropped the overlay title bar for the system title bar, restoring native
  window dragging and double-click-to-maximise.

## [0.1.4] — 2026-05-14

### Fixed

- Window drag switched from `data-tauri-drag-region` to manual `startDragging`.

## [0.1.3] — 2026-05-14

### Fixed

- Main window built programmatically, restoring window dragging.

## [0.1.2] — 2026-05-14

### Added

- Five hand-picked themes with a live-preview picker (`⌘,`).

### Fixed

- `latest.json` URL built from the release asset name.

## [0.1.1] — 2026-05-14

### Added

- Auto-update with minisign-verified payloads and per-architecture releases.

### Fixed

- Window dragging.

## [0.1.0] — 2026-05-13

Initial release. A folder-rooted markdown editor with a split live preview.

### Added

- Folder open + recursive `.md` / `.mdx` / `.markdown` file tree with pinned files.
- Plain-textarea editor with `⌘S` save and debounced auto-save.
- Live preview — GFM, emoji, syntax highlighting, slugged + autolinked headings.
- Frontmatter parsed and rendered as a colophon card above the body.
- Multi-tab editing with link-click routing between documents.
- CLI launch argument and macOS open-URL support (`md .` from the terminal).
- Quick open (`⌘P`), recent folders, drag-and-drop, keyboard-shortcuts hint.
- The Vellum & Ink design system.

[0.1.20]: https://github.com/Rohithgilla12/markdownish/releases/tag/v0.1.20
[0.1.19]: https://github.com/Rohithgilla12/markdownish/releases/tag/v0.1.19
[0.1.18]: https://github.com/Rohithgilla12/markdownish/releases/tag/v0.1.18
[0.1.17]: https://github.com/Rohithgilla12/markdownish/releases/tag/v0.1.17
[0.1.16]: https://github.com/Rohithgilla12/markdownish/releases/tag/v0.1.16
[0.1.15]: https://github.com/Rohithgilla12/markdownish/releases/tag/v0.1.15
[0.1.14]: https://github.com/Rohithgilla12/markdownish/releases/tag/v0.1.14
[0.1.13]: https://github.com/Rohithgilla12/markdownish/releases/tag/v0.1.13
[0.1.12]: https://github.com/Rohithgilla12/markdownish/releases/tag/v0.1.12
[0.1.11]: https://github.com/Rohithgilla12/markdownish/releases/tag/v0.1.11
[0.1.10]: https://github.com/Rohithgilla12/markdownish/releases/tag/v0.1.10
[0.1.9]: https://github.com/Rohithgilla12/markdownish/releases/tag/v0.1.9
[0.1.8]: https://github.com/Rohithgilla12/markdownish/releases/tag/v0.1.8
[0.1.7]: https://github.com/Rohithgilla12/markdownish/releases/tag/v0.1.7
[0.1.6]: https://github.com/Rohithgilla12/markdownish/releases/tag/v0.1.6
[0.1.5]: https://github.com/Rohithgilla12/markdownish/releases/tag/v0.1.5
[0.1.4]: https://github.com/Rohithgilla12/markdownish/releases/tag/v0.1.4
[0.1.3]: https://github.com/Rohithgilla12/markdownish/releases/tag/v0.1.3
[0.1.2]: https://github.com/Rohithgilla12/markdownish/releases/tag/v0.1.2
[0.1.1]: https://github.com/Rohithgilla12/markdownish/releases/tag/v0.1.1
[0.1.0]: https://github.com/Rohithgilla12/markdownish/releases/tag/v0.1.0
