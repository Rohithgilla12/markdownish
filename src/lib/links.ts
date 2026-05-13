/**
 * What a markdown link in the preview should do when clicked.
 *
 *  - `markdown` — open another markdown file (probably in a new tab)
 *  - `external` — let the OS handle it (browser, mail client, etc.)
 *  - `anchor`   — scroll to a heading inside the current preview
 *  - `other`    — a local file we don't know what to do with yet
 *                 (image, PDF, etc.); ignore for now
 */
export type LinkKind =
  | { kind: "markdown"; path: string; hash: string | null }
  | { kind: "external"; href: string }
  | { kind: "anchor"; hash: string }
  | { kind: "other"; path: string }
  | { kind: "unknown" };

const MARKDOWN_RE = /\.(md|mdx|markdown)$/i;
const EXTERNAL_PROTO_RE = /^(https?|mailto|tel|ftp|magnet):/i;

/**
 * Resolve a markdown link relative to the file it appears in, and classify what should
 * happen when the user clicks it.
 *
 * Examples (current file: /repo/docs/spec.md):
 *   "./plan.md"                → markdown /repo/docs/plan.md
 *   "../README.md"             → markdown /repo/README.md
 *   "/repo/posts/2025-01.md#x" → markdown /repo/posts/2025-01.md  hash="x"
 *   "#why-this-exists"         → anchor   #why-this-exists
 *   "https://anthropic.com"    → external
 */
export function classifyLink(currentFilePath: string, rawHref: string): LinkKind {
  const href = rawHref.trim();
  if (!href) return { kind: "unknown" };
  if (href.startsWith("#")) return { kind: "anchor", hash: href.slice(1) };
  if (EXTERNAL_PROTO_RE.test(href)) return { kind: "external", href };

  // Split off query/hash for the path classification.
  const [pathPart, hashPart] = href.split("#");
  const cleanPath = pathPart.split("?")[0];

  // Resolve relative to the current file's directory.
  const resolved = resolvePath(currentFilePath, cleanPath);

  if (MARKDOWN_RE.test(resolved)) {
    return { kind: "markdown", path: resolved, hash: hashPart ?? null };
  }
  return { kind: "other", path: resolved };
}

function resolvePath(currentFilePath: string, link: string): string {
  if (link.startsWith("/")) return link;

  // Drop the filename from the current path to get its directory.
  const baseDir = currentFilePath.replace(/[^/\\]+$/, "");
  const combined = baseDir + link;

  const parts: string[] = [];
  for (const segment of combined.split(/[\\/]/)) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      parts.pop();
      continue;
    }
    parts.push(segment);
  }

  const leadingSlash = combined.startsWith("/") ? "/" : "";
  return leadingSlash + parts.join("/");
}
