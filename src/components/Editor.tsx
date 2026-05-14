import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { getCaretCoordinates } from "@/lib/caret";
import { filterSnippets, type Snippet } from "@/lib/snippets";
import { SlashMenu } from "@/components/SlashMenu";

type Props = {
  path: string;
  content: string;
  onChange: (value: string) => void;
  // Kept on the props surface for API symmetry; Cmd+S is wired globally in Workspace.
  onSave: () => void;
  dirty: boolean;
  /** Lets parent observe the textarea's scroll for sync-scroll with preview. */
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
 * Decide whether `/` typed at `slashPos` should open the snippet menu.
 *
 * Conservative: only at the very start of a line. Anything else — paths,
 * URLs, "and/or" mid-sentence — leaves the editor alone.
 */
function isSlashTrigger(value: string, slashPos: number): boolean {
  if (slashPos === 0) return true;
  return value[slashPos - 1] === "\n";
}

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

  // Combined ref — keep our internal handle AND forward to parent for scroll sync.
  const setTextarea = useCallback(
    (el: HTMLTextAreaElement | null) => {
      textareaRef.current = el;
      scrollRef?.(el);
    },
    [scrollRef],
  );

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
    const caret = slash.start + 1 + slash.queryLen;
    const coords = getCaretCoordinates(el, caret);
    const rect = el.getBoundingClientRect();
    setAnchor({
      top: rect.top + coords.top + coords.height + 6,
      left: Math.min(rect.left + coords.left, window.innerWidth - 296),
    });
  }, [slash]);

  const snippets = useMemo(
    () => (slash ? filterSnippets(extractQuery(content, slash)) : []),
    [slash, content],
  );

  // Clamp the highlighted index if the filtered list shrinks. Only fire a
  // state update if the cursor *actually* changes — otherwise the effect's
  // own setSlash() bumps the slash reference, the effect re-runs, sees the
  // condition again, and we end up in an infinite render loop that React's
  // recovery silently absorbs but the editor feels stuck.
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
    const replaceTo = slash.start + 1 + slash.queryLen; // include the `/` + query
    const next = content.slice(0, replaceFrom) + text + content.slice(replaceTo);
    onChange(next);
    setSlash(null);

    // Restore focus + place caret at the right spot inside the inserted text.
    const newCaret = replaceFrom + (cursorOffset ?? text.length);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(newCaret, newCaret);
    });
  }

  function onTextareaChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const value = e.target.value;
    const caret = e.target.selectionStart;

    onChange(value);

    // Open slash menu when `/` was just typed at a valid position.
    const justTypedSlash = value[caret - 1] === "/" && (!slash || caret <= slash.start + 1);
    if (justTypedSlash && isSlashTrigger(value, caret - 1)) {
      setSlash({ start: caret - 1, queryLen: 0, cursor: 0 });
      return;
    }

    // While menu is open, update the query length OR close on out-of-bounds caret.
    if (slash) {
      if (caret <= slash.start) {
        setSlash(null);
        return;
      }
      const afterSlash = value.slice(slash.start + 1, caret);
      // Whitespace, newline, or a second `/` closes the menu.
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

  const words = useMemo(() => wordCount(content), [content]);

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
        value={content}
        onChange={onTextareaChange}
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
