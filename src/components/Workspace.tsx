import { useEffect, useMemo, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Sidebar } from "@/components/Sidebar";
import { Editor } from "@/components/Editor";
import { Preview } from "@/components/Preview";
import { ViewToggle, type ViewMode } from "@/components/ViewToggle";
import { ConflictToast } from "@/components/ConflictToast";
import { QuickOpen } from "@/components/QuickOpen";
import { ShortcutsHint } from "@/components/ShortcutsHint";
import { TabBar } from "@/components/TabBar";
import { useFolder } from "@/hooks/useFolder";
import { useTabs } from "@/hooks/useTabs";
import { cn } from "@/lib/utils";

type Props = { folder: string; initialFile?: string | null; onChangeFolder: () => void };

export function Workspace({ folder, initialFile, onChangeFolder }: Props) {
  const { tree, loading, error } = useFolder(folder);
  const t = useTabs();
  const [view, setView] = useState<ViewMode>("split");
  const [quickOpen, setQuickOpen] = useState(false);

  // Open the launch-provided file once on mount.
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

  // Window title: prefix with ● if any tab is dirty.
  useEffect(() => {
    const name = t.activeTab ? t.activeTab.path.split(/[\\/]/).pop() : "Markdownish";
    const anyDirty = unsavedPaths.size > 0;
    document.title = anyDirty ? `● ${name}` : (name ?? "Markdownish");
  }, [t.activeTab, unsavedPaths]);

  // Global shortcuts.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;

      if (e.key === "\\") {
        e.preventDefault();
        setView((m) => (m === "editor" ? "split" : m === "split" ? "preview" : "editor"));
      } else if (e.key.toLowerCase() === "p") {
        e.preventDefault();
        setQuickOpen(true);
      } else if (e.key.toLowerCase() === "o") {
        e.preventDefault();
        onChangeFolder();
      } else if (e.key.toLowerCase() === "w") {
        e.preventDefault();
        t.closeActive();
      } else if (e.key === "s") {
        e.preventDefault();
        void t.saveActive();
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
  }, [onChangeFolder, t]);

  const showEditor = view !== "preview";
  const showPreview = view !== "editor";

  function handleOpenMarkdown(path: string) {
    void t.openFile(path);
  }

  function handleOpenExternal(href: string) {
    void openUrl(href);
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
      />

      <section className="relative grid h-full min-h-0 grid-rows-[auto_1fr] overflow-hidden">
        {/* Tab bar — only shown when at least one tab is open */}
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
                />
              )}
              {showPreview && (
                <Preview
                  source={t.activeTab.content}
                  currentPath={t.activeTab.path}
                  onOpenMarkdown={handleOpenMarkdown}
                  onOpenExternal={handleOpenExternal}
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

      <ShortcutsHint />
    </main>
  );
}
