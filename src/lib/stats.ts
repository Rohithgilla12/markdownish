import { parseFrontmatter } from "@/lib/frontmatter";

export type DocStats = {
  words: number;
  characters: number;
  paragraphs: number;
  /** Estimated reading time in whole minutes (min 1 once there's any text). */
  readingMinutes: number;
};

/** Average adult silent reading speed for prose, words per minute. */
const WORDS_PER_MINUTE = 200;

/**
 * Compute document statistics from raw markdown source.
 *
 * Frontmatter is stripped first so YAML keys don't inflate the counts — the
 * stats describe the body the reader actually sees. Counting is deliberately
 * simple and predictable (whitespace tokenisation, blank-line-separated
 * blocks) rather than a full markdown parse: the numbers should be stable and
 * explainable, not philosophically perfect.
 */
export function computeDocStats(source: string): DocStats {
  const { content } = parseFrontmatter(source);
  const body = content.trim();

  if (body === "") {
    return { words: 0, characters: 0, paragraphs: 0, readingMinutes: 0 };
  }

  const words = body.split(/\s+/).filter(Boolean).length;
  const characters = content.length;
  const paragraphs = body.split(/\n\s*\n/).filter((b) => b.trim() !== "").length;
  const readingMinutes = Math.max(1, Math.round(words / WORDS_PER_MINUTE));

  return { words, characters, paragraphs, readingMinutes };
}
