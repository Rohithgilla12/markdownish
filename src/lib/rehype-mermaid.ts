/**
 * rehype plugin: lift ```mermaid fences out of the code path.
 *
 * A fenced block arrives as `<pre><code class="language-mermaid">…</code></pre>`.
 * This replaces the whole `<pre>` with
 * `<div class="mermaid-block" data-mermaid="<source>"></div>`, which the shared
 * markdown components render as a diagram.
 *
 * Doing it as a rehype pass, rather than sniffing the language inside a `code`
 * component override, matters for one reason: rehype-highlight rewrites code
 * children into nested `<span>` elements, so by the time a component override
 * saw the node the original source would already be shredded across dozens of
 * highlight spans. Running first keeps the source intact — and means highlight
 * never wastes time on a language it doesn't have a grammar for.
 *
 * Written against the hast tree directly instead of pulling in
 * unist-util-visit; the traversal is a dozen lines and this project keeps its
 * dependency list short.
 */

type HastNode = {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
};

const LANG = "language-mermaid";

function classList(node: HastNode): string[] {
  const raw = node.properties?.className;
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === "string") return raw.split(/\s+/);
  return [];
}

/** Concatenated text of a subtree. */
function textOf(node: HastNode): string {
  if (node.type === "text") return node.value ?? "";
  return (node.children ?? []).map(textOf).join("");
}

/**
 * If `node` is a `<pre>` wrapping a mermaid `<code>`, return the diagram
 * source. Otherwise null.
 */
function mermaidSource(node: HastNode): string | null {
  if (node.type !== "element" || node.tagName !== "pre") return null;
  const code = (node.children ?? []).find(
    (c) => c.type === "element" && c.tagName === "code",
  );
  if (!code) return null;
  if (!classList(code).includes(LANG)) return null;
  const source = textOf(code);
  return source.trim() === "" ? null : source;
}

function walk(node: HastNode): void {
  const children = node.children;
  if (!children) return;
  for (let i = 0; i < children.length; i++) {
    const source = mermaidSource(children[i]);
    if (source !== null) {
      children[i] = {
        type: "element",
        tagName: "div",
        properties: { className: ["mermaid-block"], dataMermaid: source },
        children: [],
      };
      continue;
    }
    walk(children[i]);
  }
}

export function rehypeMermaid() {
  return (tree: HastNode) => {
    walk(tree);
  };
}
