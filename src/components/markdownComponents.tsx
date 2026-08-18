import type { Components } from "react-markdown";
import { classifyLink } from "@/lib/links";
import { resolveImageSrc } from "@/lib/assets";
import { MermaidDiagram } from "@/components/MermaidDiagram";

type Options = {
  /** Absolute path of the file being rendered — resolves relative links. */
  currentPath: string;
  onOpenMarkdown: (path: string, hash: string | null) => void;
  onOpenExternal: (href: string) => void;
  /**
   * How to turn a relative image path into something loadable. Defaults to the
   * webview asset protocol; the export path substitutes `file://` URLs.
   */
  resolveImage?: (currentPath: string, src: string | undefined) => string | undefined;
  /**
   * Pre-rendered diagram SVGs keyed by trimmed mermaid source. Only the export
   * path supplies this — `renderToStaticMarkup` can't await, so diagrams are
   * rendered before the markup pass.
   */
  mermaidSvg?: Map<string, string>;
};

/**
 * The `components` map shared by the preview pane and reading mode.
 *
 * Both render the same document with the same link and image behaviour; keeping
 * one copy means a fix like mermaid support can't land in one view and be
 * forgotten in the other, which is exactly what happened while these were two
 * near-identical inline objects.
 */
export function createMarkdownComponents({
  currentPath,
  onOpenMarkdown,
  onOpenExternal,
  resolveImage = resolveImageSrc,
  mermaidSvg,
}: Options): Components {
  return {
    img({ src, ...props }) {
      return (
        <img
          {...props}
          src={resolveImage(currentPath, typeof src === "string" ? src : undefined)}
        />
      );
    },

    // rehype-mermaid turns ```mermaid fences into `<div data-mermaid>`; every
    // other div passes straight through.
    div({ node: _node, ...props }) {
      const source = (props as Record<string, unknown>)["data-mermaid"];
      if (typeof source === "string") {
        return <MermaidDiagram source={source} svg={mermaidSvg?.get(source.trim())} />;
      }
      return <div {...props} />;
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
  };
}
