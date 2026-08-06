import { useCallback, useEffect, useMemo, useState } from "react";
import { flushSync } from "react-dom";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  BookOpen,
  Columns2,
  Download,
  FileText,
  FilePlus,
  FolderOpen,
  ListTree,
  Palette,
  Replace,
  Save,
  Search,
  X,
} from "lucide-react";
import { Sidebar } from "@/components/Sidebar";
import { Editor } from "@/components/Editor";
import { Preview } from "@/components/Preview";
import { ViewToggle, type ViewMode } from "@/components/ViewToggle";
import { ConflictToast } from "@/components/ConflictToast";
import { TabDeletedBanner } from "@/components/TabDeletedBanner";
import { QuickOpen } from "@/components/QuickOpen";
import { FindReplacePanel } from "@/components/FindReplacePanel";
import { ShortcutsHint } from "@/components/ShortcutsHint";
import { TabBar } from "@/components/TabBar";
import { ReadingView } from "@/components/ReadingView";
import { NewFileDialog } from "@/components/NewFileDialog";
import { CommandPalette, type Command } from "@/components/CommandPalette";
import { LiveGrep } from "@/components/LiveGrep";
import { StatusBar } from "@/components/StatusBar";
import { TocPanel } from "@/components/TocPanel";
import { ExportMenu } from "@/components/ExportMenu";
import { useFolder } from "@/hooks/useFolder";
import { useTabs } from "@/hooks/useTabs";
import { useFolderWatcher, type WatcherEvent } from "@/hooks/useFolderWatcher";
import { useScrollSync } from "@/hooks/useScrollSync";
import { useTheme } from "@/hooks/useTheme";
import { computeDocStats } from "@/lib/stats";
import { extractHeadings } from "@/lib/outline";
import type { ExportFormat } from "@/lib/export";
import { THEMES } from "@/lib/themes";
import { cn } from "@/lib/utils";

type Props = { folder: string; initialFile?: string | null; onChangeFolder: () => void };

/**
 * Run a state change inside a View Transition when supported. flushSync is
 * required so React commits the new DOM *before* the transition captures it.
 */
function withViewTransition(update: () => void) {
  if (typeof document.startViewTransition === "function") {
    document.startViewTransition(() => flushSync(update));
  } else {
    update();
  }
}

export function Workspace({ folder, initialFile, onChangeFolder }: Props) {
  const { tree, loading, error, refresh: refreshFolder } = useFolder(folder);
  const t = useTabs();
  const [view, setView] = useState<ViewMode>("split");
  const [quickOpen, setQuickOpen] = useState(false);
  const [grepOpen, setGrepOpen] = useState(false);
  const [findInFolder, setFindInFolder] = useState(false);
  const [reading, setReading] = useState(false);
  const [newFile, setNewFile] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [focus, setFocus] = useState(false);
  const [outline, setOutline] = useState(false);
  const [exporting, setExporting] = useState<ExportFormat | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const { theme, commit: commitTheme } = useTheme();

  const activeContent = t.activeTab?.content ?? "";
  const stats = useMemo(() => computeDocStats(activeContent), [activeContent]);
  const headings = useMemo(() => extractHeadings(activeContent), [activeContent]);

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

  const toggleFocus = useCallback(() => {
    if (!t.activeTab) return;
    withViewTransition(() => setFocus((v) => !v));
  }, [t.activeTab]);

  // Exit focus mode if the active tab disappears or reading mode opens.
  useEffect(() => {
    if (focus && (!t.activeTab || reading)) setFocus(false);
  }, [focus, t.activeTab, reading]);

  // Scroll-sync — track the actual elements as state so the sync effect
  // re-runs cleanly when they mount/unmount. Using refs here was unreliable:
  // refs don't trigger re-renders, so if the elements weren't ready at the
  // moment `enabled` flipped, the effect bailed and never retried.
  const [editorEl, setEditorEl] = useState<HTMLTextAreaElement | null>(null);
  const [previewEl, setPreviewEl] = useState<HTMLDivElement | null>(null);
  useScrollSync(editorEl, previewEl, view === "split" && !!t.activeTab);

  useEffect(() => {
    if (initialFile) void t.openFile(initialFile);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialFile]);

  const unsavedPaths = useMemo(() => {
    const s = new Set<string>();
    for (const tab of t.tabs) {
      if (tab.content !== tab.original) s.add(tab.path);
    }
    return s;
  }, [t.tabs]);

  useEffect(() => {
    const name = t.activeTab ? t.activeTab.path.split(/[\\/]/).pop() : "Markdownish";
    const anyDirty = unsavedPaths.size > 0;
    document.title = anyDirty ? `● ${name}` : (name ?? "Markdownish");
  }, [t.activeTab, unsavedPaths]);

  const toggleReading = useCallback(() => {
    if (!t.activeTab) return;
    withViewTransition(() => setReading((r) => !r));
  }, [t.activeTab]);

  const toggleOutline = useCallback(() => setOutline((v) => !v), []);

  // Auto-exit reading if the active tab goes away (e.g. last tab closed).
  useEffect(() => {
    if (reading && !t.activeTab) setReading(false);
  }, [reading, t.activeTab]);

  // Export errors surface as a transient toast that clears itself.
  useEffect(() => {
    if (!exportError) return;
    const id = setTimeout(() => setExportError(null), 4000);
    return () => clearTimeout(id);
  }, [exportError]);

  // Global shortcuts.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;

      if (e.key === "\\") {
        e.preventDefault();
        setView((m) => (m === "editor" ? "split" : m === "split" ? "preview" : "editor"));
      } else if (e.key.toLowerCase() === "k") {
        e.preventDefault();
        setGrepOpen((v) => !v);
      } else if (e.shiftKey && e.key.toLowerCase() === "f") {
        e.preventDefault();
        setFindInFolder(true);
      } else if (e.shiftKey && e.key.toLowerCase() === "p") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      } else if (e.key.toLowerCase() === "p") {
        e.preventDefault();
        setQuickOpen(true);
      } else if (e.key.toLowerCase() === "n") {
        e.preventDefault();
        setNewFile(true);
      } else if (e.shiftKey && e.key.toLowerCase() === "o") {
        e.preventDefault();
        toggleOutline();
      } else if (e.key.toLowerCase() === "o") {
        e.preventDefault();
        onChangeFolder();
      } else if (e.key.toLowerCase() === "w") {
        e.preventDefault();
        if (reading) setReading(false);
        else t.closeActive();
      } else if (e.key === "s") {
        e.preventDefault();
        void t.saveActive();
      } else if (e.key.toLowerCase() === "r") {
        e.preventDefault();
        toggleReading();
      } else if (e.key === ".") {
        e.preventDefault();
        toggleFocus();
      } else if (e.key >= "1" && e.key <= "9") {
        const i = Number(e.key) - 1;
        if (i < t.tabs.length) {
          e.preventDefault();
          t.activate(i);
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onChangeFolder, reading, t, toggleReading, toggleFocus, toggleOutline]);

  // Focus mode forces editor-only — the preview pane is incompatible with
  // the centred writing column.
  const effectiveView: ViewMode = focus ? "editor" : view;
  const showEditor = effectiveView !== "preview";
  const showPreview = effectiveView !== "editor";
  const showOutline = outline && !!t.activeTab && !focus;

  function handleOpenMarkdown(path: string) {
    void t.openFile(path);
  }

  function handleOpenExternal(href: string) {
    void openUrl(href);
  }

  // Scroll the editor to a body-relative heading line. Outline line numbers
  // are measured after frontmatter, so add the frontmatter's line span back.
  function jumpEditorToLine(bodyLine: number) {
    const el = editorEl;
    if (!el) return;
    const value = el.value;
    const fmEnd = value.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
    const offset = fmEnd ? fmEnd[0].split("\n").length - 1 : 0;
    const targetLine = bodyLine + offset;
    const lines = value.split("\n");
    let pos = 0;
    for (let i = 0; i < targetLine && i < lines.length; i++) pos += lines[i].length + 1;
    el.focus();
    el.setSelectionRange(pos, pos);
    const lh = parseFloat(getComputedStyle(el).lineHeight) || 24;
    el.scrollTop = Math.max(0, targetLine * lh - el.clientHeight / 2);
  }

  // Open a file and place the caret on a byte-offset match, scrolled to
  // centre. Shared by find-in-folder and live grep.
  function openAtMatch(path: string, offset: number, length: number) {
    void t.openFile(path).then(() => {
      requestAnimationFrame(() => {
        const el = editorEl;
        if (!el) return;
        el.focus();
        el.setSelectionRange(offset, offset + length);
        const before = el.value.slice(0, offset);
        const line = before.split("\n").length - 1;
        const lh = parseFloat(getComputedStyle(el).lineHeight) || 24;
        el.scrollTop = Math.max(0, line * lh - el.clientHeight / 2);
      });
    });
  }

  async function handleExport(format: ExportFormat) {
    const tab = t.activeTab;
    if (!tab || exporting) return;
    setExportError(null);
    setExporting(format);
    try {
      // Lazily loaded so react-dom/server, html-to-image and fflate stay out
      // of the main bundle until the first export.
      const xp = await import("@/lib/export");
      if (format === "html") await xp.exportHtml(tab.content, tab.path);
      else if (format === "pdf") await xp.exportPdf(tab.content, tab.path);
      else if (format === "epub") await xp.exportEpub(tab.content, tab.path);
      else if (format === "png") {
        const node = previewEl?.querySelector<HTMLElement>(".prose") ?? null;
        if (!node) {
          setExportError("Show the preview pane (⌘\\) to export a PNG.");
        } else {
          const bg = getComputedStyle(previewEl as HTMLElement).backgroundColor || "#ffffff";
          await xp.exportPng(node, tab.path, bg);
        }
      }
    } catch (err) {
      setExportError(err instanceof Error ? err.message : String(err));
    } finally {
      setExporting(null);
    }
  }

  // ────────────────────────────────────────────────────────────
  // Command palette — every keyboard shortcut becomes searchable.
  // Some entries are conditional (only when a tab is open, etc.).
  // ────────────────────────────────────────────────────────────
  const commands: Command[] = useMemo(() => {
    const list: Command[] = [];

    // File commands — always available when a folder is open.
    list.push({
      id: "new-file",
      category: "File",
      label: "New file…",
      shortcut: "⌘ N",
      icon: FilePlus,
      keywords: ["create", "make"],
      run: () => setNewFile(true),
    });
    list.push({
      id: "quick-open",
      category: "File",
      label: "Quick open…",
      description: "Search files by name",
      shortcut: "⌘ P",
      icon: Search,
      keywords: ["find", "go to"],
      run: () => setQuickOpen(true),
    });
    list.push({
      id: "live-grep",
      category: "File",
      label: "Search in files…",
      description: "Live grep across this folder",
      shortcut: "⌘ K",
      icon: Search,
      keywords: ["grep", "find", "content", "telescope"],
      run: () => setGrepOpen(true),
    });
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
    list.push({
      id: "open-folder",
      category: "File",
      label: "Open a folder…",
      shortcut: "⌘ O",
      icon: FolderOpen,
      keywords: ["change"],
      run: onChangeFolder,
    });

    // Editor commands — only when a tab is open.
    if (t.activeTab) {
      list.push({
        id: "save",
        category: "Editor",
        label: "Save",
        shortcut: "⌘ S",
        icon: Save,
        run: () => t.saveActive(),
      });
      list.push({
        id: "close-tab",
        category: "Editor",
        label: "Close tab",
        shortcut: "⌘ W",
        icon: X,
        run: () => t.closeActive(),
      });
      list.push({
        id: "find-in-file",
        category: "Editor",
        label: "Find in file…",
        shortcut: "⌘ F",
        icon: Search,
        keywords: ["search"],
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
    }

    // View commands.
    list.push({
      id: "reading-mode",
      category: "View",
      label: reading ? "Exit reading mode" : "Reading mode",
      description: "Centred prose, outline gutter, progress bar",
      shortcut: "⌘ R",
      icon: BookOpen,
      keywords: ["focus", "read"],
      run: toggleReading,
    });
    list.push({
      id: "toggle-preview",
      category: "View",
      label: `Cycle view (${view})`,
      description: "Editor / split / preview",
      shortcut: "⌘ \\",
      icon: Columns2,
      run: () =>
        setView((m) => (m === "editor" ? "split" : m === "split" ? "preview" : "editor")),
    });
    list.push({
      id: "focus-mode",
      category: "View",
      label: focus ? "Exit focus mode" : "Focus mode",
      description: "Centred writing column, ambient fade",
      shortcut: "⌘ .",
      icon: BookOpen,
      keywords: ["typewriter", "zen", "distraction free"],
      run: toggleFocus,
    });
    list.push({
      id: "toggle-outline",
      category: "View",
      label: outline ? "Hide outline" : "Show outline",
      description: "Table of contents from headings",
      shortcut: "⌘ ⇧ O",
      icon: ListTree,
      keywords: ["toc", "table of contents", "headings", "navigate"],
      run: toggleOutline,
    });

    // Export commands — only when a tab is open.
    if (t.activeTab) {
      const formats: { format: ExportFormat; label: string }[] = [
        { format: "pdf", label: "PDF" },
        { format: "html", label: "HTML" },
        { format: "png", label: "PNG" },
        { format: "epub", label: "EPUB" },
      ];
      for (const { format, label } of formats) {
        list.push({
          id: `export-${format}`,
          category: "Export",
          label: `Export as ${label}`,
          icon: Download,
          keywords: ["save", "download", format],
          run: () => void handleExport(format),
        });
      }
    }

    // Switch to other open tabs.
    t.tabs.forEach((tab, i) => {
      if (i === t.activeIndex) return;
      const name = tab.path.split(/[\\/]/).filter(Boolean).pop() ?? tab.path;
      list.push({
        id: `switch-tab-${i}`,
        category: "Switch to",
        label: name,
        description: tab.path,
        shortcut: i < 9 ? `⌘ ${i + 1}` : undefined,
        icon: FileText,
        keywords: ["tab", "jump"],
        run: () => t.activate(i),
      });
    });

    // Theme commands — every theme is a one-liner.
    for (const themeMeta of THEMES) {
      const isCurrent = themeMeta.id === theme;
      list.push({
        id: `theme-${themeMeta.id}`,
        category: "Theme",
        label: isCurrent ? `${themeMeta.name} (current)` : themeMeta.name,
        description: themeMeta.description,
        icon: Palette,
        keywords: ["color", "scheme", themeMeta.appearance],
        run: () => commitTheme(themeMeta.id),
      });
    }

    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t, reading, view, theme, commitTheme, onChangeFolder, toggleReading, focus, toggleFocus, outline, toggleOutline]);

  // ────────────────────────────────────────────────────────────
  // READING MODE — preview takes over the window. No sidebar, no
  // editor, no tab bar. Cmd+R or the exit pill returns to split.
  // ────────────────────────────────────────────────────────────
  if (reading && t.activeTab && t.activeTab.status !== "loading") {
    return (
      <ReadingView
        source={t.activeTab.content}
        currentPath={t.activeTab.path}
        onOpenMarkdown={handleOpenMarkdown}
        onOpenExternal={handleOpenExternal}
        onExit={toggleReading}
      />
    );
  }

  return (
    <main
      className={cn(
        "grid h-full overflow-hidden transition-[grid-template-columns] duration-300 ease-[var(--ease-out-quart)]",
        focus ? "grid-cols-[0_1fr]" : "grid-cols-[280px_1fr]",
      )}
    >
      <div
        className={cn(
          "overflow-hidden transition-opacity duration-300",
          focus ? "pointer-events-none opacity-0" : "opacity-100",
        )}
      >
        <Sidebar
          folder={folder}
          tree={tree}
          loading={loading}
          error={error}
          selectedPath={t.activeTab?.path ?? null}
          unsavedPaths={unsavedPaths}
          onSelect={(p) => void t.openFile(p)}
          onChangeFolder={onChangeFolder}
          onNewFile={() => setNewFile(true)}
          onRefresh={refreshFolder}
        />
      </div>

      <section className="relative grid h-full min-h-0 grid-rows-[auto_1fr_auto] overflow-hidden">
        {!focus && (
          <TabBar
            tabs={t.tabs}
            activeIndex={t.activeIndex}
            onActivate={t.activate}
            onClose={t.closeFile}
          />
        )}

        <div className="flex min-h-0 overflow-hidden">
          <div className="relative min-h-0 flex-1">
          {t.activeTab && !focus && (
            <div className="pointer-events-none absolute right-5 top-3 z-20 flex">
              <div className="pointer-events-auto">
                <ViewToggle mode={view} onChange={setView} />
              </div>
            </div>
          )}

          {t.activeTab?.conflict && (
            <ConflictToast
              onReload={() => t.resolveConflict("reload")}
              onKeep={() => t.resolveConflict("keep")}
            />
          )}

          {t.activeTab?.deleted && (
            <TabDeletedBanner
              onSave={() => t.activeTab && void t.resurrectDeleted(t.activeTab.path)}
              onClose={() => t.activeTab && t.closeFile(t.activeTab.path)}
            />
          )}

          {t.activeTab && t.activeTab.status !== "loading" ? (
            <div
              className={cn(
                "grid h-full min-h-0",
                showEditor && showPreview && "grid-cols-2 divide-x divide-[color:var(--color-rule-soft)]",
                showEditor && !showPreview && "grid-cols-1",
                !showEditor && showPreview && "grid-cols-1",
              )}
            >
              {showEditor && (
                <Editor
                  key={t.activeTab.path}
                  path={t.activeTab.path}
                  content={t.activeTab.content}
                  onChange={t.setActiveContent}
                  onSave={t.saveActive}
                  dirty={t.activeTab.content !== t.activeTab.original}
                  scrollRef={setEditorEl}
                  focus={focus}
                />
              )}
              {showPreview && (
                <Preview
                  source={t.activeTab.content}
                  currentPath={t.activeTab.path}
                  onOpenMarkdown={handleOpenMarkdown}
                  onOpenExternal={handleOpenExternal}
                  scrollRef={setPreviewEl}
                />
              )}
            </div>
          ) : (
            <div className="grid h-full place-items-center">
              <div className="text-center">
                <div className="text-eyebrow mb-3">A folder is open</div>
                <p className="font-display text-3xl italic text-[color:var(--color-fg-2)]">
                  Pick a file from the sidebar.
                </p>
                <p className="text-marginalia mt-6">
                  or press <b className="font-normal text-foreground">⌘ P</b> to search files
                </p>
              </div>
            </div>
          )}
          </div>

          {showOutline && (
            <TocPanel
              headings={headings}
              previewEl={showPreview ? previewEl : null}
              onJumpToLine={jumpEditorToLine}
              onClose={() => setOutline(false)}
            />
          )}
        </div>

        {t.activeTab && t.activeTab.status !== "loading" && !focus && (
          <StatusBar stats={stats}>
            <button
              onClick={toggleOutline}
              title="Toggle outline (⌘⇧O)"
              className={cn(
                "flex items-center gap-1.5 rounded px-1.5 py-0.5 transition-colors",
                outline
                  ? "text-[color:var(--color-foil)]"
                  : "text-[color:var(--color-fg-faint)] hover:text-foreground",
              )}
            >
              <ListTree className="h-3 w-3" strokeWidth={1.8} />
              <span>Outline</span>
            </button>
            <span aria-hidden className="text-[color:var(--color-rule)]">·</span>
            <ExportMenu onExport={handleExport} busy={exporting} />
          </StatusBar>
        )}
      </section>

      {quickOpen && (
        <QuickOpen
          tree={tree}
          folder={folder}
          onSelect={(path) => {
            void t.openFile(path);
            setQuickOpen(false);
          }}
          onClose={() => setQuickOpen(false)}
        />
      )}

      {grepOpen && (
        <LiveGrep
          folder={folder}
          onSelect={(path, offset, length) => {
            openAtMatch(path, offset, length);
            setGrepOpen(false);
          }}
          onClose={() => setGrepOpen(false)}
        />
      )}

      {findInFolder && (
        <FindReplacePanel
          folder={folder}
          onSelectMatch={(path, offset, length) => {
            openAtMatch(path, offset, length);
            setFindInFolder(false);
          }}
          onClose={() => setFindInFolder(false)}
        />
      )}

      {newFile && (
        <NewFileDialog
          folder={folder}
          onCreated={(path) => {
            void refreshFolder();
            void t.openFile(path);
          }}
          onClose={() => setNewFile(false)}
        />
      )}

      {paletteOpen && (
        <CommandPalette commands={commands} onClose={() => setPaletteOpen(false)} />
      )}

      {exportError && (
        <div className="fixed bottom-12 left-1/2 z-50 -translate-x-1/2 rounded-md border border-[color:var(--color-rule)] bg-[color:var(--color-surface)] px-4 py-2 text-[13px] text-foreground shadow-xl">
          {exportError}
        </div>
      )}

      <ShortcutsHint />
    </main>
  );
}
