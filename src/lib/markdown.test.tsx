import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import ReactMarkdown from "react-markdown";
import { remarkPlugins, rehypePlugins, remarkRehypeOptions } from "./markdown";

function renderMd(source: string) {
  const { container } = render(
    <ReactMarkdown
      remarkPlugins={remarkPlugins}
      rehypePlugins={rehypePlugins}
      remarkRehypeOptions={remarkRehypeOptions}
    >
      {source}
    </ReactMarkdown>,
  );
  return container;
}

describe("markdown pipeline", () => {
  it("leaves currency amounts alone instead of parsing them as inline maths", () => {
    // Regression: with remark-math's default `singleDollarTextMath`, the run
    // between two dollar signs became an equation — a paragraph of refund
    // rules rendered as one italic blob of run-together words.
    const container = renderMd(
      "Refunds under $50 are automatic; anything over $500 needs a human.",
    );

    expect(container.querySelectorAll(".katex")).toHaveLength(0);
    expect(container.textContent).toContain("$50");
    expect(container.textContent).toContain("$500");
    expect(container.textContent).toContain("are automatic; anything over");
  });

  it("still renders $$block$$ maths", () => {
    const container = renderMd("$$\nE = mc^2\n$$");
    expect(container.querySelector(".katex-display")).not.toBeNull();
  });

  it("renders GFM tables, task lists and strikethrough", () => {
    const container = renderMd(
      ["| a | b |", "| - | - |", "| 1 | 2 |", "", "- [x] done", "", "~~gone~~"].join("\n"),
    );
    expect(container.querySelector("table")).not.toBeNull();
    expect(container.querySelector('input[type="checkbox"]')).not.toBeNull();
    expect(container.querySelector("del")).not.toBeNull();
  });

  it("gives headings ids so the outline and anchors can target them", () => {
    const container = renderMd("## Know your line");
    expect(container.querySelector("h2")?.id).toBe("know-your-line");
  });

  it("converts emoji shortcodes", () => {
    expect(renderMd(":tada: ship it").textContent).toContain("🎉");
  });

  it("lifts a mermaid fence into a diagram placeholder, not a code block", () => {
    // The default components don't render diagrams, so this checks the
    // pipeline's shape: rehype-mermaid must run before rehype-highlight and
    // hand the source through intact.
    const src = "flowchart LR\n  A[Start] --> B[End]\n";
    const container = renderMd("```mermaid\n" + src + "```");

    const block = container.querySelector("div.mermaid-block");
    expect(block).not.toBeNull();
    expect(block?.getAttribute("data-mermaid")).toBe(src);
    // Crucially: no highlight spans, and no leftover <pre>.
    expect(container.querySelector("pre")).toBeNull();
    expect(container.querySelector(".hljs")).toBeNull();
  });

  it("still highlights non-mermaid fences", () => {
    const container = renderMd("```ts\nconst a: number = 1;\n```");
    expect(container.querySelector("pre code")).not.toBeNull();
    expect(container.querySelector("div.mermaid-block")).toBeNull();
  });

  it("parses raw inline HTML (GitHub-style centred READMEs)", () => {
    const container = renderMd('<p align="center"><b>Markdownish</b></p>');
    expect(container.querySelector("p")?.getAttribute("align")).toBe("center");
    expect(container.querySelector("b")?.textContent).toBe("Markdownish");
  });
});
