import yaml from "js-yaml";

export type Frontmatter = Record<string, unknown>;

export type ParsedDoc = {
  data: Frontmatter;
  content: string;
  hasFrontmatter: boolean;
};

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

/**
 * Parse YAML frontmatter out of a markdown source. Browser-safe — does not depend on
 * Node's Buffer or fs (gray-matter does, and crashes silently in production builds).
 *
 * Always returns something usable: malformed YAML degrades to no-frontmatter rather
 * than throwing.
 */
export function parseFrontmatter(source: string): ParsedDoc {
  const match = source.match(FRONTMATTER_RE);
  if (!match) {
    return { data: {}, content: source, hasFrontmatter: false };
  }

  const [, raw, body] = match;
  try {
    const parsed = yaml.load(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const data = parsed as Frontmatter;
      return {
        data,
        content: body,
        hasFrontmatter: Object.keys(data).length > 0,
      };
    }
    return { data: {}, content: source, hasFrontmatter: false };
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
