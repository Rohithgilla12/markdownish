import { describe, expect, it } from "vitest";
import { rehypeMermaid } from "./rehype-mermaid";

type Node = {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: Node[];
};

function text(value: string): Node {
  return { type: "text", value };
}

function fence(lang: string | null, body: string): Node {
  return {
    type: "element",
    tagName: "pre",
    properties: {},
    children: [
      {
        type: "element",
        tagName: "code",
        properties: lang ? { className: [`language-${lang}`] } : {},
        children: [text(body)],
      },
    ],
  };
}

function root(...children: Node[]): Node {
  return { type: "root", children };
}

function run(tree: Node): Node {
  rehypeMermaid()(tree);
  return tree;
}

describe("rehypeMermaid", () => {
  it("replaces a mermaid fence with a div carrying the source", () => {
    const tree = run(root(fence("mermaid", "flowchart LR\n  A --> B\n")));
    const node = tree.children![0];

    expect(node.tagName).toBe("div");
    expect(node.properties?.className).toEqual(["mermaid-block"]);
    expect(node.properties?.dataMermaid).toBe("flowchart LR\n  A --> B\n");
    expect(node.children).toEqual([]);
  });

  it("leaves other fenced code alone", () => {
    const tree = run(root(fence("ts", "const a = 1;"), fence(null, "plain")));
    expect(tree.children!.map((c) => c.tagName)).toEqual(["pre", "pre"]);
  });

  it("preserves the source verbatim, including HTML in labels", () => {
    // The `<br/>` in node labels is the whole reason the source must survive
    // untouched — mermaid turns it into a line break inside the node.
    const src = 'flowchart LR\n  C[Customer request] --> O[Orchestrator<br/>durable state]\n';
    const tree = run(root(fence("mermaid", src)));
    expect(tree.children![0].properties?.dataMermaid).toBe(src);
  });

  it("finds fences nested inside blockquotes and list items", () => {
    const tree = run(
      root({
        type: "element",
        tagName: "blockquote",
        children: [
          {
            type: "element",
            tagName: "li",
            children: [fence("mermaid", "graph TD\n A-->B")],
          },
        ],
      }),
    );
    const nested = tree.children![0].children![0].children![0];
    expect(nested.tagName).toBe("div");
    expect(nested.properties?.dataMermaid).toBe("graph TD\n A-->B");
  });

  it("handles a class given as a string rather than an array", () => {
    const node = fence("mermaid", "graph TD\n A-->B");
    node.children![0].properties = { className: "language-mermaid" };
    const tree = run(root(node));
    expect(tree.children![0].tagName).toBe("div");
  });

  it("ignores an empty mermaid fence rather than emitting a blank diagram", () => {
    const tree = run(root(fence("mermaid", "   \n  ")));
    expect(tree.children![0].tagName).toBe("pre");
  });

  it("does not touch a bare code element outside a pre", () => {
    const tree = run(
      root({
        type: "element",
        tagName: "p",
        children: [
          {
            type: "element",
            tagName: "code",
            properties: { className: ["language-mermaid"] },
            children: [text("graph TD")],
          },
        ],
      }),
    );
    expect(tree.children![0].children![0].tagName).toBe("code");
  });
});
