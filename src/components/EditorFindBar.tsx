import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { ChevronDown, ChevronUp, Replace, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { EditorHandle } from "@/components/Editor";

type Props = {
  editorRef: RefObject<EditorHandle | null>;
  /** Externally controlled — Workspace opens the bar via keyboard. */
  open: boolean;
  /** Whether the replace row is initially visible. */
  initialMode: "find" | "replace";
  onClose: () => void;
  /** Notifies the parent when a replace mutated the editor text. The
   * parent uses this to mark the tab dirty / sync its `content` state. */
  onTextChanged: (text: string) => void;
};

type Opts = { caseSensitive: boolean; regex: boolean; wholeWord: boolean };

const OPTS_STORAGE_KEY = "markdownish.searchOpts"; // shared with folder search

function loadOpts(): Opts {
  try {
    const raw = localStorage.getItem(OPTS_STORAGE_KEY);
    if (!raw) return { caseSensitive: false, regex: false, wholeWord: false };
    const parsed = JSON.parse(raw);
    return {
      caseSensitive: !!parsed.caseSensitive,
      regex: !!parsed.regex,
      wholeWord: !!parsed.wholeWord,
    };
  } catch {
    return { caseSensitive: false, regex: false, wholeWord: false };
  }
}

function buildRegex(query: string, opts: Opts): RegExp | null {
  if (!query) return null;
  try {
    const body = opts.regex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const word = opts.wholeWord ? `\\b(?:${body})\\b` : body;
    const flags = opts.caseSensitive ? "g" : "gi";
    return new RegExp(word, flags);
  } catch {
    return null;
  }
}

type Match = { start: number; end: number };

function findAll(text: string, re: RegExp): Match[] {
  const out: Match[] = [];
  let m: RegExpExecArray | null;
  re.lastIndex = 0;
  while ((m = re.exec(text)) !== null) {
    out.push({ start: m.index, end: m.index + m[0].length });
    if (m[0].length === 0) re.lastIndex++; // guard zero-width matches
  }
  return out;
}

export function EditorFindBar({
  editorRef,
  open,
  initialMode,
  onClose,
  onTextChanged,
}: Props) {
  const [query, setQuery] = useState("");
  const [replacement, setReplacement] = useState("");
  const [opts, setOptsState] = useState<Opts>(loadOpts);
  const [mode, setMode] = useState<"find" | "replace">(initialMode);
  const [current, setCurrent] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const initialSelectionRef = useRef<{ start: number; end: number } | null>(null);

  const setOpts = useCallback((next: Opts) => {
    setOptsState(next);
    try {
      localStorage.setItem(OPTS_STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* fine */
    }
  }, []);

  // When the bar opens, capture current selection (so Esc can restore it)
  // and preseed the query from the selection if any.
  useEffect(() => {
    if (!open) return;
    setMode(initialMode);
    const sel = editorRef.current?.getSelection();
    initialSelectionRef.current = sel ?? null;
    if (sel && sel.end > sel.start) {
      const selected = editorRef.current?.getText().slice(sel.start, sel.end) ?? "";
      if (selected && !selected.includes("\n") && selected.length <= 120) {
        setQuery(selected);
      }
    }
    setCurrent(0);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [open, initialMode, editorRef]);

  const text = editorRef.current?.getText() ?? "";
  const regex = useMemo(() => buildRegex(query, opts), [query, opts]);
  const matches = useMemo(() => {
    if (!regex) return [];
    return findAll(text, regex);
  }, [text, regex]);

  useEffect(() => {
    if (matches.length === 0) {
      setCurrent(0);
      return;
    }
    setCurrent((c) => (c >= matches.length ? 0 : c));
  }, [matches.length]);

  useEffect(() => {
    if (!open || matches.length === 0) return;
    const m = matches[current];
    if (!m) return;
    editorRef.current?.setSelection(m.start, m.end, true);
  }, [open, current, matches, editorRef]);

  const step = useCallback(
    (delta: 1 | -1) => {
      if (matches.length === 0) return;
      setCurrent((c) => (c + delta + matches.length) % matches.length);
    },
    [matches.length],
  );

  const replaceCurrent = useCallback(() => {
    if (matches.length === 0) return;
    const m = matches[current];
    editorRef.current?.setSelection(m.start, m.end, false);
    const ok = editorRef.current?.insertAtSelection(replacement) ?? false;
    if (!ok) return;
    onTextChanged(editorRef.current?.getText() ?? "");
  }, [matches, current, replacement, editorRef, onTextChanged]);

  const replaceAll = useCallback(() => {
    if (matches.length === 0 || !regex) return;
    const ok = window.confirm(
      `Replace ${matches.length} match${matches.length === 1 ? "" : "es"} in this file?`,
    );
    if (!ok) return;
    const next = text.replace(regex, replacement);
    const el = editorRef.current;
    if (!el) return;
    el.setSelection(0, text.length, false);
    const inserted = el.insertAtSelection(next);
    if (!inserted) return;
    onTextChanged(el.getText());
    setCurrent(0);
  }, [matches, regex, text, replacement, editorRef, onTextChanged]);

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      const sel = initialSelectionRef.current;
      if (sel) editorRef.current?.setSelection(sel.start, sel.end, false);
      else editorRef.current?.focusEditor();
      onClose();
    } else if (e.key === "Enter" || e.key === "F3") {
      e.preventDefault();
      step(e.shiftKey ? -1 : 1);
    }
  }

  if (!open) return null;

  return (
    <div
      role="search"
      className="absolute left-0 right-0 top-0 z-20 border-b border-[color:var(--color-rule-soft)] bg-[color:var(--color-surface-2)]/95 px-4 py-2 backdrop-blur"
    >
      <div className="flex items-center gap-2">
        <Search className="h-4 w-4 shrink-0 text-[color:var(--color-foil)]" strokeWidth={1.5} />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKey}
          placeholder="Find…"
          className="w-full bg-transparent font-mono text-[13px] text-foreground placeholder:text-[color:var(--color-fg-faint)] focus:outline-none"
        />
        <Toggle
          label="Aa"
          active={opts.caseSensitive}
          onClick={() => setOpts({ ...opts, caseSensitive: !opts.caseSensitive })}
        />
        <Toggle
          label=".*"
          active={opts.regex}
          onClick={() => setOpts({ ...opts, regex: !opts.regex })}
        />
        <Toggle
          label="\b"
          active={opts.wholeWord}
          onClick={() => setOpts({ ...opts, wholeWord: !opts.wholeWord })}
        />
        <span className="text-marginalia w-16 shrink-0 text-right tabular-nums">
          {matches.length === 0 ? "0 of 0" : `${current + 1} of ${matches.length}`}
        </span>
        <button
          aria-label="Previous match"
          onClick={() => step(-1)}
          className="rounded p-1 text-[color:var(--color-fg-dim)] hover:bg-[color:var(--color-foil)]/15 hover:text-[color:var(--color-foil)]"
        >
          <ChevronUp className="h-3.5 w-3.5" strokeWidth={1.6} />
        </button>
        <button
          aria-label="Next match"
          onClick={() => step(1)}
          className="rounded p-1 text-[color:var(--color-fg-dim)] hover:bg-[color:var(--color-foil)]/15 hover:text-[color:var(--color-foil)]"
        >
          <ChevronDown className="h-3.5 w-3.5" strokeWidth={1.6} />
        </button>
        <button
          aria-label={mode === "replace" ? "Hide replace" : "Show replace"}
          onClick={() => setMode(mode === "replace" ? "find" : "replace")}
          className={cn(
            "rounded p-1",
            mode === "replace"
              ? "bg-[color:var(--color-foil)]/15 text-[color:var(--color-foil)]"
              : "text-[color:var(--color-fg-dim)] hover:text-foreground",
          )}
        >
          <Replace className="h-3.5 w-3.5" strokeWidth={1.6} />
        </button>
        <button
          aria-label="Close find"
          onClick={onClose}
          className="rounded p-1 text-[color:var(--color-fg-dim)] hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" strokeWidth={1.6} />
        </button>
      </div>
      {mode === "replace" && (
        <div className="mt-1.5 flex items-center gap-2">
          <Replace className="h-4 w-4 shrink-0 text-[color:var(--color-fg-dim)]" strokeWidth={1.5} />
          <input
            value={replacement}
            onChange={(e) => setReplacement(e.target.value)}
            onKeyDown={onKey}
            placeholder="Replace with…"
            className="w-full bg-transparent font-mono text-[13px] text-foreground placeholder:text-[color:var(--color-fg-faint)] focus:outline-none"
          />
          <button
            disabled={matches.length === 0}
            onClick={replaceCurrent}
            className={cn(
              "rounded-full px-2 py-0.5 font-mono text-[10px] tracking-[0.14em] uppercase",
              matches.length === 0
                ? "text-[color:var(--color-fg-faint)]"
                : "text-[color:var(--color-fg-dim)] hover:bg-[color:var(--color-foil)]/15 hover:text-[color:var(--color-foil)]",
            )}
          >
            Replace
          </button>
          <button
            disabled={matches.length === 0}
            onClick={replaceAll}
            className={cn(
              "rounded-full px-2 py-0.5 font-mono text-[10px] tracking-[0.14em] uppercase",
              matches.length === 0
                ? "text-[color:var(--color-fg-faint)]"
                : "bg-[color:var(--color-foil)]/15 text-[color:var(--color-foil)] hover:bg-[color:var(--color-foil)]/25",
            )}
          >
            Replace all
          </button>
        </div>
      )}
    </div>
  );
}

function Toggle({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded px-1.5 py-0.5 font-mono text-[10px] tracking-[0.14em] uppercase",
        active
          ? "bg-[color:var(--color-foil)]/15 text-[color:var(--color-foil)]"
          : "text-[color:var(--color-fg-dim)] hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}
