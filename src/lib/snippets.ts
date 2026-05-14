/**
 * Slash-menu snippet registry. Each snippet has a trigger (matched against
 * the typed query after `/`), a label/description shown in the menu, and an
 * insert function that returns the literal text to splice in plus the
 * cursor offset *into that text* where the caret should land afterwards.
 */
export type Snippet = {
  trigger: string;
  label: string;
  description?: string;
  /** Returns the text to insert and the caret offset into that text. */
  apply: () => { text: string; cursorOffset?: number };
};

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function now(): string {
  // 2026-05-14 18:42 — local time, slimmed to minutes
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const SNIPPETS: Snippet[] = [
  {
    trigger: "h1",
    label: "Heading 1",
    description: "# Heading",
    apply: () => ({ text: "# " }),
  },
  {
    trigger: "h2",
    label: "Heading 2",
    description: "## Heading",
    apply: () => ({ text: "## " }),
  },
  {
    trigger: "h3",
    label: "Heading 3",
    description: "### Heading",
    apply: () => ({ text: "### " }),
  },
  {
    trigger: "today",
    label: "Today",
    description: "ISO date — e.g. 2026-05-14",
    apply: () => ({ text: today() }),
  },
  {
    trigger: "now",
    label: "Now",
    description: "Date + time — e.g. 2026-05-14 18:42",
    apply: () => ({ text: now() }),
  },
  {
    trigger: "code",
    label: "Code block",
    description: "Fenced ```",
    apply: () => ({
      text: "```\n\n```\n",
      // Land inside the fence, on the empty line.
      cursorOffset: 4,
    }),
  },
  {
    trigger: "ts",
    label: "TypeScript code block",
    description: "```ts",
    apply: () => ({ text: "```ts\n\n```\n", cursorOffset: 6 }),
  },
  {
    trigger: "table",
    label: "Table",
    description: "3-column table skeleton",
    apply: () => ({
      text: "| col1 | col2 | col3 |\n| ---- | ---- | ---- |\n|      |      |      |\n",
    }),
  },
  {
    trigger: "check",
    label: "Task list",
    description: "- [ ] todo",
    apply: () => ({ text: "- [ ] " }),
  },
  {
    trigger: "quote",
    label: "Blockquote",
    description: "> quote",
    apply: () => ({ text: "> " }),
  },
  {
    trigger: "hr",
    label: "Horizontal rule",
    description: "---",
    apply: () => ({ text: "\n---\n\n" }),
  },
  {
    trigger: "link",
    label: "Link",
    description: "[text](url)",
    apply: () => ({ text: "[](url)", cursorOffset: 1 }),
  },
  {
    trigger: "img",
    label: "Image",
    description: "![alt](src)",
    apply: () => ({ text: "![](./image.png)", cursorOffset: 2 }),
  },
];

/**
 * Filter the snippet list by a typed query (the chars between `/` and the caret).
 * Simple substring-startsWith-substring scoring; empty query returns the full set.
 */
export function filterSnippets(query: string): Snippet[] {
  const q = query.trim().toLowerCase();
  if (!q) return SNIPPETS;
  return SNIPPETS.filter((s) => s.trigger.toLowerCase().includes(q))
    .sort((a, b) => {
      const aStarts = a.trigger.toLowerCase().startsWith(q);
      const bStarts = b.trigger.toLowerCase().startsWith(q);
      if (aStarts && !bStarts) return -1;
      if (!aStarts && bStarts) return 1;
      return a.trigger.length - b.trigger.length;
    });
}
