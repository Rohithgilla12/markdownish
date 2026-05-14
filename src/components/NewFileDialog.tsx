import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { CornerDownLeft, FilePlus } from "lucide-react";

type Props = {
  folder: string;
  onCreated: (path: string) => void;
  onClose: () => void;
};

/**
 * Small modal anchored under the title bar. Asks for a filename relative
 * to the open folder, calls the Rust create_text_file command, then hands
 * the absolute path back so the parent can refresh the tree and open the
 * file as a new tab.
 */
export function NewFileDialog({ folder, onCreated, onClose }: Props) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const trimmed = name.trim();
  const finalName = trimmed
    ? /\.(md|mdx|markdown)$/i.test(trimmed)
      ? trimmed
      : `${trimmed}.md`
    : "";
  // Show the absolute target path under the input so it's obvious where the
  // file lands. Normalise separators for display.
  const targetPath = finalName
    ? `${folder.replace(/\/$/, "")}/${finalName.replace(/^\/+/, "")}`
    : "";

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!finalName) return;
    try {
      await invoke<number>("create_text_file", {
        path: targetPath,
        contents: "",
      });
      onCreated(targetPath);
      onClose();
    } catch (err) {
      setError(String(err));
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-start pt-[18vh]"
      onMouseDown={onClose}
    >
      <div
        className="absolute inset-0 bg-[color:var(--color-bg)]/75 backdrop-blur-sm"
        aria-hidden
      />
      <form
        onSubmit={submit}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
        className="relative mx-auto w-[min(560px,92vw)] overflow-hidden rounded-xl border border-[color:var(--color-rule)] bg-[color:var(--color-surface)]/95 shadow-[0_50px_120px_-30px_rgba(0,0,0,0.7)]"
      >
        <header className="flex items-center gap-3 border-b border-[color:var(--color-rule-soft)] px-5 py-3">
          <FilePlus className="h-4 w-4 text-[color:var(--color-foil)]" strokeWidth={1.6} />
          <span className="text-eyebrow text-[color:var(--color-foil)]">— New file —</span>
        </header>

        <div className="px-5 py-4">
          <input
            ref={inputRef}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError(null);
            }}
            placeholder="filename or path/to/filename.md"
            spellCheck={false}
            className="w-full bg-transparent font-display text-xl italic text-foreground placeholder:text-[color:var(--color-fg-faint)] focus:outline-none"
          />
          <div className="text-marginalia mt-2 truncate">
            {finalName ? targetPath : "starts at the open folder"}
          </div>
          {error && (
            <div className="text-marginalia mt-2 text-[color:var(--color-foil)]">
              {error}
            </div>
          )}
        </div>

        <footer className="flex items-center gap-3 border-t border-[color:var(--color-rule-soft)] px-5 py-2.5">
          <span className="text-marginalia">
            .md appended if omitted · subfolders created on demand
          </span>
          <span className="ml-auto inline-flex items-center gap-3">
            <span className="text-marginalia">
              <b className="font-normal text-foreground">esc</b> cancel
            </span>
            <button
              type="submit"
              disabled={!finalName}
              className="inline-flex items-center gap-2 rounded-full bg-[color:var(--color-foil)]/15 px-3 py-1 font-mono text-[11px] tracking-[0.14em] uppercase text-[color:var(--color-foil)] transition-opacity disabled:opacity-30 hover:enabled:bg-[color:var(--color-foil)]/25"
            >
              Create
              <CornerDownLeft className="h-3 w-3" strokeWidth={1.8} />
            </button>
          </span>
        </footer>
      </form>
    </div>
  );
}
