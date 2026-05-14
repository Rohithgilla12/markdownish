import type { ComponentProps } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkEmoji from "remark-emoji";
import rehypeRaw from "rehype-raw";
import rehypeSlug from "rehype-slug";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypeHighlight from "rehype-highlight";

/**
 * Shared plugin set for the preview pane.
 *
 *  - remark-gfm: GFM tables, strikethrough, task lists, autolinks
 *  - remark-emoji: shortcodes (`:tada:` → 🎉)
 *  - rehype-raw: parses raw inline HTML in markdown (centred `<p align>`,
 *    `<img>`, badge `<a>` blocks, etc.) — without this every README that
 *    leans on GitHub-style HTML for centring + badges renders as escaped
 *    angle-bracket soup. Must run *first* so subsequent rehype plugins
 *    operate on the real DOM tree.
 *  - rehype-slug: id attributes on headings (including those that came
 *    from raw HTML, e.g. `<h1>` blocks)
 *  - rehype-autolink-headings: clickable anchors on headings
 *  - rehype-highlight: highlight.js syntax highlighting
 *
 * Order is load-bearing: raw → slug → autolink → highlight.
 */
export const remarkPlugins: ComponentProps<typeof ReactMarkdown>["remarkPlugins"] = [
  remarkGfm,
  remarkEmoji,
];

export const rehypePlugins: ComponentProps<typeof ReactMarkdown>["rehypePlugins"] = [
  rehypeRaw,
  rehypeSlug,
  [
    rehypeAutolinkHeadings,
    {
      behavior: "wrap",
      properties: { className: ["heading-anchor"] },
    },
  ],
  [
    rehypeHighlight,
    {
      detect: true,
      ignoreMissing: true,
    },
  ],
];

/**
 * Options passed straight to remark-rehype inside react-markdown. The flag
 * lets raw HTML nodes survive the markdown → hast conversion; rehype-raw
 * then parses them into real DOM. Without this, GFM HTML in READMEs renders
 * as escaped angle-bracket text. The "dangerous" name only matters when
 * you're rendering untrusted markdown on the open web — we're rendering
 * the user's own files in a local desktop window.
 */
export const remarkRehypeOptions = { allowDangerousHtml: true };
