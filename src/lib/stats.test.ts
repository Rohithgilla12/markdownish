import { describe, expect, it } from "vitest";
import { computeDocStats } from "@/lib/stats";

describe("computeDocStats", () => {
  it("returns zeroes for empty or whitespace-only input", () => {
    expect(computeDocStats("")).toEqual({
      words: 0,
      characters: 0,
      paragraphs: 0,
      readingMinutes: 0,
    });
    expect(computeDocStats("   \n\n  ")).toMatchObject({ words: 0, paragraphs: 0 });
  });

  it("counts words by whitespace", () => {
    expect(computeDocStats("the quick brown fox").words).toBe(4);
    expect(computeDocStats("one\ntwo\tthree").words).toBe(3);
  });

  it("counts blank-line-separated blocks as paragraphs", () => {
    const doc = "# Heading\n\nFirst paragraph.\n\nSecond paragraph here.";
    expect(computeDocStats(doc).paragraphs).toBe(3);
  });

  it("ignores frontmatter in the body counts", () => {
    const withFm = "---\ntitle: My Doc\ntags: [a, b]\n---\n\nHello world.";
    const stats = computeDocStats(withFm);
    expect(stats.words).toBe(2);
    expect(stats.paragraphs).toBe(1);
  });

  it("reports at least one reading minute once there is text", () => {
    expect(computeDocStats("hello").readingMinutes).toBe(1);
  });

  it("scales reading time with length", () => {
    const longDoc = Array.from({ length: 600 }, () => "word").join(" ");
    expect(computeDocStats(longDoc).readingMinutes).toBe(3);
  });
});
