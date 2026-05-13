import matter from "gray-matter";

export type Frontmatter = Record<string, unknown>;

export type ParsedDoc = {
  data: Frontmatter;
  content: string;
  hasFrontmatter: boolean;
};

/**
 * Parse YAML frontmatter from a markdown string. Returns { data, content, hasFrontmatter }.
 * Falls back to the original source when parsing fails — we never want a bad frontmatter
 * to nuke the preview.
 */
export function parseFrontmatter(source: string): ParsedDoc {
  try {
    const result = matter(source);
    const keys = Object.keys(result.data ?? {});
    return {
      data: result.data ?? {},
      content: result.content,
      hasFrontmatter: keys.length > 0,
    };
  } catch {
    return { data: {}, content: source, hasFrontmatter: false };
  }
}

/**
 * Render a frontmatter value as a single line of text. Arrays become comma-separated,
 * objects become JSON, dates become ISO. Anything unrecognised is coerced to a string.
 */
export function formatFrontmatterValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (Array.isArray(value)) return value.map(formatFrontmatterValue).join(", ");
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}
