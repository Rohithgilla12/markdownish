import type { ComponentProps } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkEmoji from "remark-emoji";
import rehypeSlug from "rehype-slug";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypeShiki from "@shikijs/rehype";

/**
 * Shared plugin set for the preview pane. Centralised so we can extend in one place.
 *
 *  - remark-gfm: GFM tables, strikethrough, task lists, autolinks
 *  - remark-emoji: shortcodes (`:tada:` → 🎉)
 *  - rehype-slug: id attributes on headings
 *  - rehype-autolink-headings: clickable anchors on headings
 *  - @shikijs/rehype: syntax highlighting via Shiki
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
    rehypeShiki,
    {
      themes: { light: "vitesse-light", dark: "vitesse-dark" },
      defaultColor: "dark",
      // Restrict the grammar set — Shiki ships hundreds of grammars by default
      // and each one is its own chunk. We only need what shows up in CLAUDE.md /
      // README.md / spec files in practice.
      langs: [
        "bash",
        "shell",
        "javascript",
        "typescript",
        "jsx",
        "tsx",
        "json",
        "yaml",
        "toml",
        "markdown",
        "rust",
        "python",
        "html",
        "css",
        "diff",
        "sql",
        "go",
        "ruby",
        "dockerfile",
      ],
    },
  ],
];
