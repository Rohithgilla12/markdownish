import GithubSlugger from "github-slugger";
import { parseFrontmatter } from "@/lib/frontmatter";

export type Heading = {
  /** Slug id — matches the `id` rehype-slug puts on the rendered heading. */
  id: string;
  /** 1–6. */
  level: number;
  /** Visible heading text (markdown inline syntax stripped). */
  text: string;
  /** 0-based line index in the *body* (after frontmatter) — used to scroll the editor. */
  line: number;
};

const FENCE = /^(\s*)(`{3,}|~{3,})/;
const ATX = /^(#{1,6})\s+(.*?)(?:\s+#+)?\s*$/;

/**
 * Strip the inline markdown that commonly appears in heading text so the
 * outline reads cleanly: links → their label, emphasis/code markers removed.
 * Deliberately light — headings rarely contain exotic inline syntax.
 */
function stripInline(text: string): string {
  return text
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1") // [label](url) / ![alt](src) → label
    .replace(/\[([^\]]*)\]\[[^\]]*\]/g, "$1") // [label][ref] → label
    .replace(/[*_~`]/g, "")
    .trim();
}

/**
 * Extract the heading outline from markdown source.
 *
 * Parses ATX headings (`#`…`######`) line by line, skipping fenced code blocks
 * so a `# comment` inside a code sample never becomes an outline entry.
 * Frontmatter is stripped first; `line` is relative to the body so callers can
 * map an entry back to a source line. Ids are generated with the same
 * github-slugger rehype-slug uses, so clicking an entry can target the
 * rendered heading's `id` directly.
 */
export function extractHeadings(source: string): Heading[] {
  const { content } = parseFrontmatter(source);
  const lines = content.split("\n");
  const slugger = new GithubSlugger();
  const headings: Heading[] = [];

  let fence: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fenceMatch = line.match(FENCE);
    if (fenceMatch) {
      const marker = fenceMatch[2][0];
      if (fence === null) fence = marker;
      else if (marker === fence) fence = null;
      continue;
    }
    if (fence !== null) continue;

    const m = line.match(ATX);
    if (!m) continue;

    const text = stripInline(m[2]);
    if (text === "") continue;

    headings.push({
      id: slugger.slug(text),
      level: m[1].length,
      text,
      line: i,
    });
  }

  return headings;
}
