import { useCallback, useEffect, useMemo, useState } from "react";
import { flushSync } from "react-dom";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  BookOpen,
  Columns2,
  FileText,
  FilePlus,
  FolderOpen,
  Palette,
  Save,
  Search,
  X,
} from "lucide-react";
import { Sidebar } from "@/components/Sidebar";
import { Editor } from "@/components/Editor";
import { Preview } from "@/components/Preview";
import { ViewToggle, type ViewMode } from "@/components/ViewToggle";
import { ConflictToast } from "@/components/ConflictToast";
import { QuickOpen } from "@/components/QuickOpen";
import { ShortcutsHint } from "@/components/ShortcutsHint";
import { TabBar } from "@/components/TabBar";
import { ReadingView } from "@/components/ReadingView";
import { NewFileDialog } from "@/components/NewFileDialog";
import { CommandPalette, type Command } from "@/components/CommandPalette";
import { useFolder } from "@/hooks/useFolder";
import { useTabs } from "@/hooks/useTabs";
import { useScrollSync } from "@/hooks/useScrollSync";
import { useTheme } from "@/hooks/useTheme";
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
  const [reading, setReading] = useState(false);
  const [newFile, setNewFile] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const { theme, commit: commitTheme } = useTheme();

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

  // Auto-exit reading if the active tab goes away (e.g. last tab closed).
  useEffect(() => {
    if (reading && !t.activeTab) setReading(false);
  }, [reading, t.activeTab]);

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
        setPaletteOpen((v) => !v);
      } else if (e.key.toLowerCase() === "p") {
        e.preventDefault();
        setQuickOpen(true);
      } else if (e.key.toLowerCase() === "n") {
        e.preventDefault();
        setNewFile(true);
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
  }, [onChangeFolder, reading, t, toggleReading]);

  const showEditor = view !== "preview";
  const showPreview = view !== "editor";

  function handleOpenMarkdown(path: string) {
    void t.openFile(path);
  }

  function handleOpenExternal(href: string) {
    void openUrl(href);
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
  }, [t, reading, view, theme, commitTheme, onChangeFolder, toggleReading]);

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
    <main className="grid h-full grid-cols-[280px_1fr] overflow-hidden">
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
      />

      <section className="relative grid h-full min-h-0 grid-rows-[auto_1fr] overflow-hidden">
        <TabBar
          tabs={t.tabs}
          activeIndex={t.activeIndex}
          onActivate={t.activate}
          onClose={t.closeFile}
        />

        <div className="relative min-h-0">
          {t.activeTab && (
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

      <ShortcutsHint />
    </main>
  );
}
