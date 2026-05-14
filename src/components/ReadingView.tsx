import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { ArrowLeft } from "lucide-react";
import { remarkPlugins, rehypePlugins, remarkRehypeOptions } from "@/lib/markdown";
import { parseFrontmatter } from "@/lib/frontmatter";
import { classifyLink } from "@/lib/links";
import { resolveImageSrc } from "@/lib/assets";
import { FrontmatterCard } from "@/components/FrontmatterCard";
import { Outline, type OutlineHeading } from "@/components/Outline";

type Props = {
  source: string;
  currentPath: string;
  onOpenMarkdown: (path: string, hash: string | null) => void;
  onOpenExternal: (href: string) => void;
  onExit: () => void;
};

/**
 * Reading Mode — the preview takes over the window.
 *
 *   - Sticky 1px foil progress bar at the top, fills as you scroll.
 *   - Right-side outline gutter (H1/H2/H3) with scroll-spy. Click an entry
 *     to smooth-scroll to it.
 *   - Content centred to 58ch with generous padding so the reading column
 *     feels like a book page.
 *   - Top-right pill (Cmd+R) to exit.
 *
 * Mounted in place of the split editor/preview when Workspace's `reading`
 * state is on. View Transitions wrap the mount/unmount so the swap morphs.
 */
export function ReadingView({
  source,
  currentPath,
  onOpenMarkdown,
  onOpenExternal,
  onExit,
}: Props) {
  const parsed = useMemo(() => parseFrontmatter(source), [source]);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [progress, setProgress] = useState(0);
  const [headings, setHeadings] = useState<OutlineHeading[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  // Extract headings after the markdown renders. rAF defers to the next
  // paint so the prose DOM is in place.
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const proseEl = scrollRef.current?.querySelector(".prose");
      if (!proseEl) {
        setHeadings([]);
        return;
      }
      const items = Array.from(
        proseEl.querySelectorAll<HTMLElement>("h1, h2, h3"),
      )
        .filter((el) => el.id)
        .map((el) => ({
          id: el.id,
          level: parseInt(el.tagName[1], 10),
          text: el.textContent?.trim() ?? "",
        }));
      setHeadings(items);
    });
    return () => cancelAnimationFrame(id);
  }, [source]);

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

  function jumpTo(id: string) {
    const el = scrollRef.current?.querySelector<HTMLElement>(
      `[id="${CSS.escape(id)}"]`,
    );
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div
      ref={scrollRef}
      className="relative h-full min-h-0 overflow-y-auto bg-[color:var(--color-bg)]"
      style={{ viewTransitionName: "doc-surface" }}
    >
      {/* Scroll progress hairline */}
      <div
        aria-hidden
        className="sticky top-0 z-30 h-px bg-[color:var(--color-rule-soft)]"
      >
        <div
          className="h-full bg-[color:var(--color-foil)] transition-[width] duration-150 ease-out"
          style={{ width: `${progress * 100}%` }}
        />
      </div>

      {/* Exit pill */}
      <button
        onClick={onExit}
        className="fixed right-8 top-4 z-30 inline-flex items-center gap-2 rounded-full border border-[color:var(--color-rule)] bg-[color:var(--color-surface)]/85 px-3.5 py-1.5 font-mono text-[10.5px] tracking-[0.16em] uppercase text-[color:var(--color-fg-dim)] backdrop-blur transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-3 w-3" strokeWidth={1.8} />
        <span>Exit reading</span>
        <kbd className="font-mono text-[10px] text-[color:var(--color-fg-faint)]">⌘R</kbd>
      </button>

      <Outline headings={headings} activeId={activeId} onJump={jumpTo} />

      {/* Centred prose column */}
      <article
        className="prose mx-auto max-w-[58ch] px-10 pb-32 pt-20"
        style={{ viewTransitionName: "doc-content" }}
      >
        {parsed.hasFrontmatter && <FrontmatterCard data={parsed.data} />}
        <ReactMarkdown
          remarkPlugins={remarkPlugins}
          rehypePlugins={rehypePlugins}
          remarkRehypeOptions={remarkRehypeOptions}
          components={{
            img({ src, ...props }) {
              return <img {...props} src={resolveImageSrc(currentPath, typeof src === "string" ? src : undefined)} />;
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
    </div>
  );
}
