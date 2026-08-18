import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { ArrowLeft } from "lucide-react";
import { remarkPlugins, rehypePlugins, remarkRehypeOptions } from "@/lib/markdown";
import { parseFrontmatter } from "@/lib/frontmatter";
import { classifyLink } from "@/lib/links";
import { resolveImageSrc } from "@/lib/assets";
import { computeDocStats } from "@/lib/stats";
import {
  MEASURE_ORDER,
  RAIL_CLASS,
  SCALE_ORDER,
  proseStyle,
  step,
  type ReaderPrefs,
} from "@/lib/reader";
import { FrontmatterCard } from "@/components/FrontmatterCard";
import { ReaderControls } from "@/components/ReaderControls";
import { Outline, type OutlineHeading } from "@/components/Outline";
import { cn } from "@/lib/utils";

type Props = {
  source: string;
  currentPath: string;
  prefs: ReaderPrefs;
  onChangePrefs: (patch: Partial<ReaderPrefs>) => void;
  onResetPrefs: () => void;
  onOpenMarkdown: (path: string, hash: string | null) => void;
  onOpenExternal: (href: string) => void;
  onExit: () => void;
};

/** How far a keyboard `j`/`k` moves, as a fraction of the viewport. */
const KEY_SCROLL_FRACTION = 0.18;
/**
 * A drop cap only works on a run of plain prose. Below this many characters
 * the floated letter is taller than the paragraph it's supposed to open.
 */
const DROPCAP_MIN_CHARS = 140;

function basename(p: string): string {
  return p.split(/[\\/]/).filter(Boolean).pop() ?? p;
}

/**
 * Reading Mode — the preview takes over the window.
 *
 *   - Sticky header: filename, word count, reading time, typography controls.
 *   - Hairline progress bar that fills as you scroll.
 *   - The outline is an in-flow sticky rail, not an overlay, so the prose
 *     column stays centred in the space it leaves at every width setting.
 *   - Column width / text size / body font come from `useReaderPrefs` and are
 *     also bound to the keyboard (`−`/`+`, `[`/`]`).
 *   - `j`/`k` scroll, `g`/`G` jump to top/bottom, `Esc` or `⌘R` exits.
 *
 * Mounted in place of the split editor/preview when Workspace's `reading`
 * state is on. View Transitions wrap the mount/unmount so the swap morphs.
 */
export function ReadingView({
  source,
  currentPath,
  prefs,
  onChangePrefs,
  onResetPrefs,
  onOpenMarkdown,
  onOpenExternal,
  onExit,
}: Props) {
  const parsed = useMemo(() => parseFrontmatter(source), [source]);
  const stats = useMemo(() => computeDocStats(source), [source]);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [progress, setProgress] = useState(0);
  const [headings, setHeadings] = useState<OutlineHeading[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  // Post-render DOM pass: collect headings for the outline, and decide
  // whether the opening paragraph can carry a drop cap.
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const proseEl = scrollRef.current?.querySelector(".prose");
      if (!proseEl) {
        setHeadings([]);
        return;
      }

      const items = Array.from(proseEl.querySelectorAll<HTMLElement>("h1, h2, h3"))
        .filter((el) => el.id)
        .map((el) => ({
          id: el.id,
          level: parseInt(el.tagName[1], 10),
          text: el.textContent?.trim() ?? "",
        }));
      setHeadings(items);

      // A drop cap needs a *plain text* opening long enough to wrap around
      // it. Paragraphs that start with emphasis, a link, or inline code have
      // their first letter inside a child element, where the floated glyph
      // inherits italics or a code background and reads as a mistake — which
      // is exactly what a CSS-only `h1 + p::first-letter` rule was doing.
      for (const el of proseEl.querySelectorAll<HTMLElement>(".has-dropcap")) {
        el.classList.remove("has-dropcap");
      }
      const lead = proseEl.querySelector<HTMLElement>("h1 + p");
      const firstNode = lead?.firstChild;
      const startsWithText =
        firstNode?.nodeType === Node.TEXT_NODE &&
        /^\s*[\p{L}\p{N}]/u.test(firstNode.textContent ?? "");
      if (
        lead &&
        startsWithText &&
        (lead.textContent?.trim().length ?? 0) >= DROPCAP_MIN_CHARS
      ) {
        lead.classList.add("has-dropcap");
      }
    });
    return () => cancelAnimationFrame(id);
  }, [source, prefs.measure, prefs.scale, prefs.family]);

  // Single scroll handler: drives both the progress bar and the active
  // heading. Manual scroll-spy (rather than IntersectionObserver) is more
  // predictable for "the closest heading above the trigger line wins".
  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;

    function update() {
      const root = scrollRef.current;
      if (!root) return;

      const max = root.scrollHeight - root.clientHeight;
      setProgress(max > 0 ? root.scrollTop / max : 0);

      const proseEl = root.querySelector(".prose");
      if (!proseEl) return;
      const triggerY = root.getBoundingClientRect().top + 120;
      const els = proseEl.querySelectorAll<HTMLElement>("h1, h2, h3");

      let active: string | null = null;
      for (const el of els) {
        if (!el.id) continue;
        if (el.getBoundingClientRect().top <= triggerY) {
          active = el.id;
        } else {
          break;
        }
      }
      setActiveId(active);
    }

    root.addEventListener("scroll", update, { passive: true });
    update();
    return () => root.removeEventListener("scroll", update);
  }, [source, headings.length]);

  const jumpTo = useCallback((id: string) => {
    const el = scrollRef.current?.querySelector<HTMLElement>(`[id="${CSS.escape(id)}"]`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  // Reading-mode keyboard map. Single unmodified keys only, and never while
  // something typable has focus, so the controls popover stays usable.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target?.isContentEditable) return;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      const root = scrollRef.current;
      if (!root) return;
      const nudge = root.clientHeight * KEY_SCROLL_FRACTION;

      switch (e.key) {
        case "j":
          e.preventDefault();
          root.scrollBy({ top: nudge, behavior: "smooth" });
          break;
        case "k":
          e.preventDefault();
          root.scrollBy({ top: -nudge, behavior: "smooth" });
          break;
        case "g":
          e.preventDefault();
          root.scrollTo({ top: 0, behavior: "smooth" });
          break;
        case "G":
          e.preventDefault();
          root.scrollTo({ top: root.scrollHeight, behavior: "smooth" });
          break;
        case "+":
        case "=":
          e.preventDefault();
          onChangePrefs({ scale: step(SCALE_ORDER, prefs.scale, 1) });
          break;
        case "-":
        case "_":
          e.preventDefault();
          onChangePrefs({ scale: step(SCALE_ORDER, prefs.scale, -1) });
          break;
        case "]":
          e.preventDefault();
          onChangePrefs({ measure: step(MEASURE_ORDER, prefs.measure, 1) });
          break;
        case "[":
          e.preventDefault();
          onChangePrefs({ measure: step(MEASURE_ORDER, prefs.measure, -1) });
          break;
        case "Escape":
          e.preventDefault();
          onExit();
          break;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [prefs.scale, prefs.measure, onChangePrefs, onExit]);

  const name = basename(currentPath);

  return (
    <div
      ref={scrollRef}
      className="relative h-full min-h-0 overflow-y-auto bg-[color:var(--color-bg)]"
      style={{ viewTransitionName: "doc-surface" }}
    >
      {/* Sticky chrome: progress hairline + header. Sits in one stacking
          context so the header's backdrop-blur doesn't clip the bar. */}
      <div className="sticky top-0 z-30">
        <header className="flex items-center gap-4 border-b border-[color:var(--color-rule-soft)] bg-[color:var(--color-bg)]/85 px-6 py-3 backdrop-blur">
          <button
            onClick={onExit}
            className="inline-flex shrink-0 items-center gap-2 rounded-full border border-[color:var(--color-rule)] px-3 py-1.5 font-mono text-[10.5px] uppercase tracking-[0.16em] text-[color:var(--color-fg-dim)] transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-3 w-3" strokeWidth={1.8} />
            <span>Exit</span>
            <kbd className="font-mono text-[10px] text-[color:var(--color-fg-faint)]">⌘R</kbd>
          </button>

          <div className="min-w-0 flex-1">
            <div className="truncate font-mono text-[12.5px] text-[color:var(--color-fg-2)]">
              {name}
            </div>
            <div className="text-marginalia mt-0.5 text-[10.5px]">
              {stats.words.toLocaleString()} words · {stats.readingMinutes} min read ·{" "}
              {Math.round(progress * 100)}%
            </div>
          </div>

          <ReaderControls
            prefs={prefs}
            onChange={onChangePrefs}
            onReset={onResetPrefs}
            keyHints
          />
        </header>

        <div aria-hidden className="h-px bg-[color:var(--color-rule-soft)]">
          <div
            className="h-full bg-[color:var(--color-foil)] transition-[width] duration-150 ease-out"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      </div>

      {/* Prose and the outline rail are siblings, so the rail can never sit on
          top of the text at wider measures. The mirror spacer on the left is
          what keeps the prose optically centred in the window rather than
          shunted left by the rail's width. Both vanish together below `lg`. */}
      <div
        className="mx-auto flex w-full max-w-[100rem] gap-8 px-6 lg:px-10"
        style={proseStyle(prefs)}
      >
        <div aria-hidden className={cn("w-60 shrink-0", RAIL_CLASS[prefs.measure])} />

        <article
          className="prose mx-auto w-full min-w-0 pb-40 pt-16"
          style={{ viewTransitionName: "doc-content" }}
        >
          {parsed.hasFrontmatter && <FrontmatterCard data={parsed.data} />}
          <ReactMarkdown
            remarkPlugins={remarkPlugins}
            rehypePlugins={rehypePlugins}
            remarkRehypeOptions={remarkRehypeOptions}
            components={{
              img({ src, ...props }) {
                return (
                  <img
                    {...props}
                    src={resolveImageSrc(
                      currentPath,
                      typeof src === "string" ? src : undefined,
                    )}
                  />
                );
              },
              a({ href, children, ...props }) {
                return (
                  <a
                    {...props}
                    href={href}
                    onClick={(e) => {
                      if (!href) return;
                      const kind = classifyLink(currentPath, href);
                      if (kind.kind === "external") {
                        e.preventDefault();
                        onOpenExternal(kind.href);
                      } else if (kind.kind === "markdown") {
                        e.preventDefault();
                        onOpenMarkdown(kind.path, kind.hash);
                      } else if (kind.kind === "anchor") {
                        // default scroll
                      } else {
                        e.preventDefault();
                      }
                    }}
                  >
                    {children}
                  </a>
                );
              },
            }}
          >
            {parsed.content}
          </ReactMarkdown>
        </article>

        <Outline
          headings={headings}
          activeId={activeId}
          onJump={jumpTo}
          className={RAIL_CLASS[prefs.measure]}
        />
      </div>
    </div>
  );
}
