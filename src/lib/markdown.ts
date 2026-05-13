import type { ComponentProps } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkEmoji from "remark-emoji";
import rehypeSlug from "rehype-slug";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypeHighlight from "rehype-highlight";

/**
 * Shared plugin set for the preview pane.
 *
 *  - remark-gfm: GFM tables, strikethrough, task lists, autolinks
 *  - remark-emoji: shortcodes (`:tada:` → 🎉)
 *  - rehype-slug: id attributes on headings
 *  - rehype-autolink-headings: clickable anchors on headings
 *  - rehype-highlight: highlight.js syntax highlighting (sync, browser-safe)
 *
 * We previously used Shiki via @shikijs/rehype which is gorgeous but ships a WASM
 * regex engine. In production Tauri builds the WASM never finished loading on first
 * paint and crashed the React tree — rehype-highlight is sync, pure JS, and just works.
 */
export const remarkPlugins: ComponentProps<typeof ReactMarkdown>["remarkPlugins"] = [
  remarkGfm,
  remarkEmoji,
];

export const rehypePlugins: ComponentProps<typeof ReactMarkdown>["rehypePlugins"] = [
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
