import { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import { remarkPlugins, rehypePlugins, remarkRehypeOptions } from "@/lib/markdown";
import { parseFrontmatter } from "@/lib/frontmatter";
import { classifyLink } from "@/lib/links";
import { resolveImageSrc } from "@/lib/assets";
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
};

export function Preview({ source, currentPath, onOpenMarkdown, onOpenExternal, scrollRef }: Props) {
  const parsed = useMemo(() => parseFrontmatter(source), [source]);

  return (
    <div
      ref={scrollRef}
      className="h-full min-h-0 overflow-y-auto bg-[color:var(--color-bg)]"
      style={{ viewTransitionName: "doc-surface" }}
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
                      // Let the browser handle native fragment scrolling.
                    } else {
                      // Local non-markdown file — block the navigation so the webview
                      // doesn't try to load it.
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
