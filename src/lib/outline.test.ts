import { describe, expect, it } from "vitest";
import { extractHeadings } from "@/lib/outline";

describe("extractHeadings", () => {
  it("captures ATX headings with levels", () => {
    const out = extractHeadings("# Title\n\n## Section\n\n### Sub");
    expect(out.map((h) => [h.level, h.text])).toEqual([
      [1, "Title"],
      [2, "Section"],
      [3, "Sub"],
    ]);
  });

  it("slugs match github-slugger, deduping collisions", () => {
    const out = extractHeadings("# Hello World\n\n## Hello World");
    expect(out[0].id).toBe("hello-world");
    expect(out[1].id).toBe("hello-world-1");
  });

  it("ignores hashes inside fenced code blocks", () => {
    const src = "# Real\n\n```\n# not a heading\n```\n\n## Also real";
    expect(extractHeadings(src).map((h) => h.text)).toEqual(["Real", "Also real"]);
  });

  it("handles tilde fences too", () => {
    const src = "~~~\n# nope\n~~~\n# yep";
    expect(extractHeadings(src).map((h) => h.text)).toEqual(["yep"]);
  });

  it("strips inline markdown from heading text", () => {
    const out = extractHeadings("# A [link](http://x) and `code` and *em*");
    expect(out[0].text).toBe("A link and code and em");
  });

  it("strips trailing closing hashes", () => {
    expect(extractHeadings("## Closed ##")[0].text).toBe("Closed");
  });

  it("reports body-relative line numbers, skipping frontmatter", () => {
    const src = "---\ntitle: x\n---\n# First\n\nbody\n\n## Second";
    const out = extractHeadings(src);
    expect(out[0]).toMatchObject({ text: "First", line: 0 });
    expect(out[1]).toMatchObject({ text: "Second", line: 4 });
  });
});
