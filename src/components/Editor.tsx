import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { cn } from "@/lib/utils";
import { getCaretCoordinates } from "@/lib/caret";
import { filterSnippets, type Snippet } from "@/lib/snippets";
import { SlashMenu } from "@/components/SlashMenu";
import { EditorFindBar } from "@/components/EditorFindBar";

type Props = {
  path: string;
  content: string;
  onChange: (value: string) => void;
  onSave: () => void;
  dirty: boolean;
  scrollRef?: (el: HTMLTextAreaElement | null) => void;
  /**
   * Typewriter mode. Caret stays at vertical center; chrome (header,
   * footer) is hidden; top + bottom of the editor fade ambient.
   */
  focus?: boolean;
};

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
export const Editor = forwardRef<EditorHandle, Props>(function Editor(
  { path, content, onChange, onSave: _onSave, dirty, scrollRef, focus = false },
  ref,
) {
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

  // Build the handle once per render (cheap; all closures over textareaRef.current).
  const editorHandle = useMemo<EditorHandle>(
    () => ({
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
        // Intentionally does NOT call el.focus() — the find bar drives
        // this on every match step, and stealing focus would route the
        // user's next Enter into the textarea instead of the find
        // input. setSelectionRange works on an unfocused textarea; the
        // browser renders the selection in its dim/inactive style.
        const el = textareaRef.current;
        if (!el) return;
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

  // Internal ref so EditorFindBar can always reach the handle, regardless
  // of whether a parent forwards an external ref. Assigning to a ref
  // during render is safe — refs are mutable boxes, not React state.
  const internalRef = useRef<EditorHandle | null>(null);
  internalRef.current = editorHandle;

  // Forward the same handle to any external ref consumer (Workspace
  // doesn't currently use one, but the API should still work if it
  // adds one later).
  useImperativeHandle(ref, () => editorHandle, [editorHandle]);

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

  // L X/Y marginalia tracking + typewriter caret centering.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    function update() {
      const el = textareaRef.current;
      if (!el) return;
      const before = el.value.slice(0, el.selectionStart);
      const lineIdx = before.split("\n").length;
      setCursor({ line: lineIdx, total: lineCount(el.value) });

      // Typewriter mode: scroll so the active line sits at the vertical
      // centre of the textarea. Line-based math is cheap and accurate as
      // long as text wraps at the same point — for monospace + a ~80-90ch
      // wrap that's close enough not to feel off.
      if (focus) {
        const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || 24;
        const target = (lineIdx - 1) * lineHeight - el.clientHeight / 2 + lineHeight / 2;
        el.scrollTop = Math.max(0, target);
      }
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
  }, [path, focus]);

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

  return (
    <div
      className={cn(
        "relative flex h-full min-h-0 flex-col",
        focus ? "bg-[color:var(--color-bg)]" : "bg-[color:var(--color-surface)]/30",
      )}
    >
      <EditorFindBar
        editorRef={internalRef}
        open={findOpen}
        initialMode={findMode}
        onClose={() => setFindOpen(false)}
        onTextChanged={() => {
          /* setText / insertAtSelection already call onChange — nothing extra. */
        }}
      />

      {/* Header — hidden in focus mode */}
      {!focus && (
        <>
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
        </>
      )}

      <textarea
        ref={setTextarea}
        key={path}
        defaultValue={content}
        onInput={onTextareaInput}
        onKeyDown={onTextareaKeyDown}
        onBlur={() => setSlash(null)}
        spellCheck={false}
        className={cn(
          "min-h-0 flex-1 resize-none bg-transparent outline-none",
          "font-mono text-[13.5px] leading-[1.75] text-foreground",
          "[caret-color:var(--color-foil)]",
          "selection:bg-[color:var(--color-foil)]/30",
          focus
            ? "mx-auto w-full max-w-[80ch] px-8 py-[35vh]"
            : "px-7 py-6",
        )}
      />

      {/* Ambient fades — top and bottom of the editor blur into the bg so
          lines that scroll past centre soften into nothing. Only active in
          focus mode. */}
      {focus && (
        <>
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-[28vh]"
            style={{
              background:
                "linear-gradient(to bottom, var(--color-bg) 0%, color-mix(in oklch, var(--color-bg), transparent 30%) 55%, transparent 100%)",
            }}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-[28vh]"
            style={{
              background:
                "linear-gradient(to top, var(--color-bg) 0%, color-mix(in oklch, var(--color-bg), transparent 30%) 55%, transparent 100%)",
            }}
          />
        </>
      )}

      {/* Footer — hidden in focus mode */}
      {!focus && (
        <footer className="flex shrink-0 items-center gap-3 border-t border-[color:var(--color-rule-soft)] px-7 py-3">
          <span className="text-marginalia">
            L {cursor.line} / {cursor.total}
          </span>
          <span className="ml-auto text-marginalia">UTF-8 · LF</span>
        </footer>
      )}

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
});

function extractQuery(content: string, slash: SlashState): string {
  return content.slice(slash.start + 1, slash.start + 1 + slash.queryLen);
}
