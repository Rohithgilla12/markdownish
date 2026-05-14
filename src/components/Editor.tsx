import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { getCaretCoordinates } from "@/lib/caret";
import { filterSnippets, type Snippet } from "@/lib/snippets";
import { SlashMenu } from "@/components/SlashMenu";

type Props = {
  path: string;
  content: string;
  onChange: (value: string) => void;
  onSave: () => void;
  dirty: boolean;
  scrollRef?: (el: HTMLTextAreaElement | null) => void;
};

type SlashState = {
  /** Index of the `/` character in content. */
  start: number;
  /** Length of the currently typed query after the `/`. */
  queryLen: number;
  cursor: number;
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

/**
 * Slash menu only opens when `/` is the first character of a new line —
 * never mid-word or in URLs.
 */
function isSlashTrigger(value: string, slashPos: number): boolean {
  if (slashPos === 0) return true;
  return value[slashPos - 1] === "\n";
}

/**
 * The textarea is **uncontrolled** — defaultValue + onInput rather than
 * value + onChange. React 19's controlled-textarea wiring doesn't fire its
 * synthetic onChange inside Tauri's WKWebView for reasons we couldn't
 * nail down. onInput maps to the underlying browser event and fires
 * reliably, so we use that and sync external content changes back via
 * effect. `key={path}` remounts the textarea on file switch.
 */
export function Editor({
  path,
  content,
  onChange,
  onSave: _onSave,
  dirty,
  scrollRef,
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [cursor, setCursor] = useState({ line: 1, total: 1 });
  const [slash, setSlash] = useState<SlashState | null>(null);
  const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(null);
  // Mirrors the textarea's current value so React-only consumers (the slash
  // query, word count, etc.) see the live edits. Updated on every input event.
  const [liveValue, setLiveValue] = useState(content);

  const setTextarea = useCallback(
    (el: HTMLTextAreaElement | null) => {
      textareaRef.current = el;
      if (scrollRef) scrollRef(el);
    },
    [scrollRef],
  );

  // External content changes (file watch reload, conflict resolution, snippet
  // splice) — push the new value into the textarea. Skip when the DOM already
  // matches so we never clobber the user's caret mid-keystroke.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    if (el.value !== content) {
      el.value = content;
      setLiveValue(content);
    }
  }, [content]);

  // Keep liveValue in sync with the incoming content on file switch.
  useEffect(() => {
    setLiveValue(content);
  }, [path, content]);

  // L X/Y marginalia tracking.
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

  // Re-anchor the slash menu near the caret whenever the slash state changes.
  useEffect(() => {
    if (!slash) {
      setAnchor(null);
      return;
    }
    const el = textareaRef.current;
    if (!el) return;
    const caretPos = slash.start + 1 + slash.queryLen;
    const coords = getCaretCoordinates(el, caretPos);
    const rect = el.getBoundingClientRect();
    setAnchor({
      top: rect.top + coords.top + coords.height + 6,
      left: Math.min(rect.left + coords.left, window.innerWidth - 296),
    });
  }, [slash]);

  const snippets = useMemo(
    () => (slash ? filterSnippets(extractQuery(liveValue, slash)) : []),
    [slash, liveValue],
  );

  // Clamp the highlighted index if the filtered list shrinks. Only update if
  // the cursor actually changes — otherwise we'd loop on equal values.
  useEffect(() => {
    if (!slash) return;
    const maxCursor = Math.max(0, snippets.length - 1);
    const clamped = Math.min(slash.cursor, maxCursor);
    if (clamped !== slash.cursor) {
      setSlash((s) => (s ? { ...s, cursor: clamped } : s));
    }
  }, [snippets.length, slash]);

  function applySnippet(snippet: Snippet) {
    const el = textareaRef.current;
    if (!el || !slash) return;
    const { text, cursorOffset } = snippet.apply();
    const replaceFrom = slash.start;
    const replaceTo = slash.start + 1 + slash.queryLen;
    const currentValue = el.value;
    const next =
      currentValue.slice(0, replaceFrom) + text + currentValue.slice(replaceTo);

    // Write to the textarea first, then sync state. With an uncontrolled
    // textarea we must mutate el.value ourselves; the content-sync effect
    // skips because they match after this.
    el.value = next;
    setLiveValue(next);
    onChange(next);
    setSlash(null);

    const newCaret = replaceFrom + (cursorOffset ?? text.length);
    el.focus();
    el.setSelectionRange(newCaret, newCaret);
  }

  function onTextareaInput(e: React.FormEvent<HTMLTextAreaElement>) {
    const value = e.currentTarget.value;
    const caret = e.currentTarget.selectionStart;
    setLiveValue(value);
    onChange(value);

    // Open slash menu when `/` was just typed at a valid position.
    const justTypedSlash =
      value[caret - 1] === "/" && (!slash || caret <= slash.start + 1);
    if (justTypedSlash && isSlashTrigger(value, caret - 1)) {
      setSlash({ start: caret - 1, queryLen: 0, cursor: 0 });
      return;
    }

    // While menu is open, update the query OR close on out-of-bounds caret.
    if (slash) {
      if (caret <= slash.start) {
        setSlash(null);
        return;
      }
      const afterSlash = value.slice(slash.start + 1, caret);
      if (/[\s/]/.test(afterSlash)) {
        setSlash(null);
        return;
      }
      setSlash({ start: slash.start, queryLen: afterSlash.length, cursor: 0 });
    }
  }

  function onTextareaKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!slash || snippets.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSlash({ ...slash, cursor: Math.min(slash.cursor + 1, snippets.length - 1) });
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSlash({ ...slash, cursor: Math.max(slash.cursor - 1, 0) });
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      const snip = snippets[slash.cursor];
      if (snip) applySnippet(snip);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setSlash(null);
    }
  }

  const words = useMemo(() => wordCount(liveValue), [liveValue]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-[color:var(--color-surface)]/30">
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

      <textarea
        ref={setTextarea}
        key={path}
        defaultValue={content}
        onInput={onTextareaInput}
        onKeyDown={onTextareaKeyDown}
        onBlur={() => setSlash(null)}
        spellCheck={false}
        className={cn(
          "min-h-0 flex-1 resize-none bg-transparent px-7 py-6 outline-none",
          "font-mono text-[13.5px] leading-[1.75] text-foreground",
          "[caret-color:var(--color-foil)]",
          "selection:bg-[color:var(--color-foil)]/30",
        )}
      />

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

      {slash && anchor && snippets.length > 0 && (
        <SlashMenu
          snippets={snippets}
          cursor={slash.cursor}
          anchor={anchor}
          onPick={applySnippet}
          onCursor={(i) => setSlash({ ...slash, cursor: i })}
        />
      )}
    </div>
  );
}

function extractQuery(content: string, slash: SlashState): string {
  return content.slice(slash.start + 1, slash.start + 1 + slash.queryLen);
}
