import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type Props = {
  path: string;
  content: string;
  onChange: (value: string) => void;
  onSave: () => void;
  dirty: boolean;
};

function basename(p: string) {
  return p.split(/[\\/]/).filter(Boolean).pop() ?? p;
}

function wordCount(s: string): number {
  const t = s.trim();
  if (!t) return 0;
  return t.split(/\s+/).length;
}

function lineCount(s: string): number {
  if (!s) return 1;
  return s.split("\n").length;
}

export function Editor({ path, content, onChange, onSave, dirty }: Props) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [cursor, setCursor] = useState({ line: 1, total: 1 });

  // Cmd/Ctrl+S → explicit save. Bind on the window so it works even when the
  // textarea isn't focused (e.g. you clicked the preview).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        onSave();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onSave]);

  // Track cursor position for the L X/Y marginalia.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    function update() {
      const el = textareaRef.current;
      if (!el) return;
      const before = el.value.slice(0, el.selectionStart);
      const line = before.split("\n").length;
      setCursor({ line, total: lineCount(el.value) });
    }
    update();
    el.addEventListener("keyup", update);
    el.addEventListener("click", update);
    el.addEventListener("input", update);
    return () => {
      el.removeEventListener("keyup", update);
      el.removeEventListener("click", update);
      el.removeEventListener("input", update);
    };
  }, [path]);

  const words = useMemo(() => wordCount(content), [content]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-[color:var(--color-surface)]/30">
      {/* Editor header — marginalia row with filename + save state */}
      <header className="flex shrink-0 items-center gap-3 px-7 pt-9 pb-3">
        <span className="font-display text-base text-foreground">{basename(path)}</span>
        <span className="text-marginalia">·</span>
        <span className="text-marginalia truncate">{path}</span>
        <span className="ml-auto flex items-center gap-2">
          {dirty ? (
            <>
              <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--color-foil)]" />
              <span className="text-marginalia text-[color:var(--color-foil)]">UNSAVED</span>
            </>
          ) : (
            <span className="text-marginalia">SAVED</span>
          )}
        </span>
      </header>

      <div className="rule-hair mx-7 shrink-0" />

      {/* Textarea — the editor itself. No CodeMirror, just a beautifully styled textarea. */}
      <textarea
        ref={textareaRef}
        value={content}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        className={cn(
          "min-h-0 flex-1 resize-none bg-transparent px-7 py-6 outline-none",
          "font-mono text-[13.5px] leading-[1.75] text-foreground",
          "[caret-color:var(--color-foil)]",
          "selection:bg-[color:var(--color-foil)]/30",
        )}
      />

      {/* Footer marginalia — words, line position, encoding */}
      <footer className="flex shrink-0 items-center gap-3 border-t border-[color:var(--color-rule-soft)] px-7 py-3">
        <span className="text-marginalia">
          {words.toLocaleString()} {words === 1 ? "word" : "words"}
        </span>
        <span className="text-marginalia">·</span>
        <span className="text-marginalia">
          L {cursor.line} / {cursor.total}
        </span>
        <span className="ml-auto text-marginalia">UTF-8 · LF</span>
      </footer>
    </div>
  );
}
