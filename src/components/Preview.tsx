import { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import { remarkPlugins, rehypePlugins, remarkRehypeOptions } from "@/lib/markdown";
import { proseStyle, type ReaderPrefs } from "@/lib/reader";
import { parseFrontmatter } from "@/lib/frontmatter";
import { createMarkdownComponents } from "@/components/markdownComponents";
import { FrontmatterCard } from "@/components/FrontmatterCard";

type Props = {
  source: string;
  /** Absolute path of the file being previewed — needed to resolve relative links. */
  currentPath: string;
  /** Called when a markdown link to another .md/.mdx/.markdown is activated. */
  onOpenMarkdown: (path: string, hash: string | null) => void;
  /** Called when an external link is activated; should hand it to the OS. */
  onOpenExternal: (href: string) => void;
  /** Lets parent observe the scroll container for sync-scroll with the editor. */
  scrollRef?: (el: HTMLDivElement | null) => void;
  /** Shared reading typography, so toggling into reading mode doesn't reflow. */
  prefs: ReaderPrefs;
};

export function Preview({ source, currentPath, onOpenMarkdown, onOpenExternal, scrollRef, prefs }: Props) {
  const parsed = useMemo(() => parseFrontmatter(source), [source]);
  const components = useMemo(
    () => createMarkdownComponents({ currentPath, onOpenMarkdown, onOpenExternal }),
    [currentPath, onOpenMarkdown, onOpenExternal],
  );

  return (
    <div
      ref={scrollRef}
      className="h-full min-h-0 overflow-y-auto bg-[color:var(--color-bg)]"
      style={{ ...proseStyle(prefs), viewTransitionName: "doc-surface" }}
    >
      <article
        className="prose mx-auto px-10 py-10"
        style={{ viewTransitionName: "doc-content" }}
      >
        {parsed.hasFrontmatter && <FrontmatterCard data={parsed.data} />}
        <ReactMarkdown
          remarkPlugins={remarkPlugins}
          rehypePlugins={rehypePlugins}
          remarkRehypeOptions={remarkRehypeOptions}
          components={components}
        >
          {parsed.content}
        </ReactMarkdown>
      </article>
    </div>
  );
}
