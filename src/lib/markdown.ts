import type { ComponentProps } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkEmoji from "remark-emoji";
import remarkMath from "remark-math";
import rehypeRaw from "rehype-raw";
import rehypeKatex from "rehype-katex";
import rehypeSlug from "rehype-slug";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypeHighlight from "rehype-highlight";
import { rehypeMermaid } from "@/lib/rehype-mermaid";

/**
 * Shared plugin set for the preview pane.
 *
 *  - remark-gfm: GFM tables, strikethrough, task lists, autolinks
 *  - remark-emoji: shortcodes (`:tada:` → 🎉)
 *  - remark-math: `$$block$$` LaTeX → math nodes. Single-dollar inline math
 *    is deliberately OFF: in the kind of notes this editor exists for, `$`
 *    is overwhelmingly a currency symbol or a shell prompt, and two of them
 *    on the same line silently swallowed the text between them into a
 *    mangled equation ("refunds ≤ $50 ... over $500" → one italic blob).
 *    `$$…$$` still renders, which is what anyone actually writing maths uses.
 *  - rehype-raw: parses raw inline HTML in markdown (centred `<p align>`,
 *    `<img>`, badge `<a>` blocks, etc.) — without this every README that
 *    leans on GitHub-style HTML for centring + badges renders as escaped
 *    angle-bracket soup. Must run *first* so subsequent rehype plugins
 *    operate on the real DOM tree.
 *  - rehype-katex: renders the remark-math nodes to KaTeX HTML
 *  - rehype-slug: id attributes on headings (including those that came
 *    from raw HTML, e.g. `<h1>` blocks)
 *  - rehype-autolink-headings: clickable anchors on headings
 *  - rehype-mermaid: lifts ```mermaid fences out of the code path into
 *    `<div data-mermaid>` so the diagram renders as a picture. Must run
 *    *before* rehype-highlight, which would otherwise shred the source into
 *    highlight spans and leave nothing to hand mermaid.
 *  - rehype-highlight: highlight.js syntax highlighting
 *
 * Order is load-bearing: raw → katex → slug → autolink → mermaid → highlight.
 */
export const remarkPlugins: ComponentProps<typeof ReactMarkdown>["remarkPlugins"] = [
  remarkGfm,
  remarkEmoji,
  [remarkMath, { singleDollarTextMath: false }],
];

export const rehypePlugins: ComponentProps<typeof ReactMarkdown>["rehypePlugins"] = [
  rehypeRaw,
  rehypeKatex,
  rehypeSlug,
  [
    rehypeAutolinkHeadings,
    {
      behavior: "wrap",
      properties: { className: ["heading-anchor"] },
    },
  ],
  rehypeMermaid,
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
