import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import { save } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { toPng } from "html-to-image";
import { zipSync, strToU8 } from "fflate";
import { remarkPlugins, rehypePlugins, remarkRehypeOptions } from "@/lib/markdown";
import { parseFrontmatter } from "@/lib/frontmatter";
import { extractHeadings } from "@/lib/outline";

export type ExportFormat = "html" | "pdf" | "png" | "epub";

/** KaTeX stylesheet (with its web fonts) for standalone documents. */
const KATEX_CDN =
  "https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css";

// ────────────────────────────────────────────────────────────────
// Naming + titles
// ────────────────────────────────────────────────────────────────

function baseName(path: string): string {
  const file = path.split(/[\\/]/).pop() ?? "document";
  return file.replace(/\.(md|mdx|markdown)$/i, "");
}

/** Best title for the document: frontmatter `title`, else first H1, else filename. */
function documentTitle(source: string, path: string): string {
  const { data } = parseFrontmatter(source);
  if (data && typeof data.title === "string" && data.title.trim()) {
    return data.title.trim();
  }
  const h1 = extractHeadings(source).find((h) => h.level === 1);
  return h1?.text ?? baseName(path);
}

// ────────────────────────────────────────────────────────────────
// Image resolution — relative/absolute local paths → file:// URLs so a
// standalone HTML/ePub document can still load them when opened elsewhere.
// ────────────────────────────────────────────────────────────────

function resolveExportImage(currentPath: string, src: string | undefined): string | undefined {
  if (!src) return src;
  const t = src.trim();
  if (!t || /^(https?|data|file):/i.test(t)) return t;

  let abs: string;
  if (t.startsWith("/")) {
    abs = t;
  } else {
    const baseDir = currentPath.replace(/[^/\\]+$/, "");
    const parts: string[] = [];
    for (const part of (baseDir + t).split(/[\\/]/)) {
      if (part === "" || part === ".") continue;
      if (part === "..") parts.pop();
      else parts.push(part);
    }
    abs = "/" + parts.join("/");
  }
  return "file://" + abs.split("/").map(encodeURIComponent).join("/");
}

// ────────────────────────────────────────────────────────────────
// Body rendering — reuse the exact preview plugin set so exports match
// what the user sees (GFM, math, highlight, slugged headings).
// ────────────────────────────────────────────────────────────────

function renderBodyHtml(source: string, currentPath: string): string {
  const { content } = parseFrontmatter(source);
  return renderToStaticMarkup(
    createElement(
      ReactMarkdown,
      {
        remarkPlugins,
        rehypePlugins,
        remarkRehypeOptions,
        components: {
          img: ({ src, ...props }: { src?: unknown }) =>
            createElement("img", {
              ...props,
              src: resolveExportImage(currentPath, typeof src === "string" ? src : undefined),
            }),
        },
      },
      content,
    ),
  );
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// ────────────────────────────────────────────────────────────────
// Document stylesheet — a clean light "paper" theme, deliberately
// independent of the app's dark UI tokens. Exported docs should read and
// print well anywhere, so this is portable system-font typography.
// ────────────────────────────────────────────────────────────────

const DOC_CSS = `
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: #fdfdfb;
    color: #1c1b19;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    font-size: 17px;
    line-height: 1.7;
    -webkit-font-smoothing: antialiased;
  }
  main { max-width: 720px; margin: 0 auto; padding: 72px 28px 96px; }
  h1, h2, h3, h4, h5, h6 { line-height: 1.25; font-weight: 650; margin: 1.8em 0 0.6em; letter-spacing: -0.01em; }
  h1 { font-size: 2.2em; margin-top: 0; }
  h2 { font-size: 1.6em; padding-bottom: 0.2em; border-bottom: 1px solid #e7e4dd; }
  h3 { font-size: 1.3em; }
  p, ul, ol, blockquote, table, pre { margin: 0 0 1.1em; }
  a { color: #9a6a2f; text-underline-offset: 2px; }
  strong { font-weight: 650; }
  blockquote { margin-left: 0; padding: 0.2em 0 0.2em 1.1em; border-left: 2px solid #c9a063; color: #4a463f; font-style: italic; }
  ul, ol { padding-left: 1.4em; }
  li { margin: 0.3em 0; }
  img { max-width: 100%; height: auto; border-radius: 6px; }
  hr { border: 0; border-top: 1px solid #e7e4dd; margin: 2.4em 0; }
  code { font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace; font-size: 0.86em; }
  :not(pre) > code { background: #f1efe9; border: 1px solid #e2ded5; border-radius: 4px; padding: 0.1em 0.35em; }
  pre { background: #f7f5f0; border: 1px solid #e7e4dd; border-radius: 8px; padding: 1em 1.1em; overflow-x: auto; line-height: 1.6; }
  pre code { background: none; border: 0; padding: 0; }
  table { width: 100%; border-collapse: collapse; font-size: 0.95em; }
  th, td { text-align: left; padding: 0.5em 0.8em; border-bottom: 1px solid #e7e4dd; }
  th { font-weight: 650; }
  .katex-display { overflow-x: auto; overflow-y: hidden; padding: 0.3em 0; }
  /* highlight.js — calm light tokens */
  .hljs-comment, .hljs-quote { color: #8a8576; font-style: italic; }
  .hljs-keyword, .hljs-selector-tag, .hljs-literal, .hljs-section { color: #9a6a2f; }
  .hljs-string, .hljs-attr, .hljs-attribute { color: #5a7d3a; }
  .hljs-number, .hljs-meta, .hljs-symbol { color: #b0762a; }
  .hljs-title, .hljs-name, .hljs-type, .hljs-built_in { color: #3a6a8a; }
  @media print {
    body { background: #fff; }
    main { padding: 0; max-width: none; }
    a { color: inherit; text-decoration: underline; }
    pre, blockquote, table, img { break-inside: avoid; }
  }
`;

function standaloneHtml(title: string, bodyHtml: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeXml(title)}</title>
<link rel="stylesheet" href="${KATEX_CDN}" />
<style>${DOC_CSS}</style>
</head>
<body>
<main class="prose">
${bodyHtml}
</main>
</body>
</html>`;
}

// ────────────────────────────────────────────────────────────────
// Save helpers
// ────────────────────────────────────────────────────────────────

async function saveBytes(
  data: Uint8Array,
  defaultName: string,
  filterName: string,
  ext: string,
): Promise<boolean> {
  const path = await save({
    defaultPath: defaultName,
    filters: [{ name: filterName, extensions: [ext] }],
  });
  if (!path) return false;
  await invoke("write_export_file", { path, data: Array.from(data) });
  return true;
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// ────────────────────────────────────────────────────────────────
// Public exporters
// ────────────────────────────────────────────────────────────────

export async function exportHtml(source: string, currentPath: string): Promise<boolean> {
  const title = documentTitle(source, currentPath);
  const html = standaloneHtml(title, renderBodyHtml(source, currentPath));
  return saveBytes(strToU8(html), baseName(currentPath) + ".html", "HTML", "html");
}

/**
 * PDF via print. The styled document is written into an offscreen iframe and
 * that iframe alone is printed — on macOS the print panel's "Save as PDF"
 * produces a clean, paginated PDF without dragging the app chrome along.
 */
export async function exportPdf(source: string, currentPath: string): Promise<void> {
  const title = documentTitle(source, currentPath);
  const html = standaloneHtml(title, renderBodyHtml(source, currentPath));

  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  Object.assign(iframe.style, {
    position: "fixed",
    right: "0",
    bottom: "0",
    width: "0",
    height: "0",
    border: "0",
    opacity: "0",
  });
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument;
  if (!doc) {
    iframe.remove();
    throw new Error("Could not create print frame");
  }
  doc.open();
  doc.write(html);
  doc.close();

  await new Promise<void>((resolve) => {
    if (iframe.contentDocument?.readyState === "complete") resolve();
    else iframe.addEventListener("load", () => resolve(), { once: true });
  });
  // Let the KaTeX webfonts + stylesheet settle before painting the print view.
  await new Promise((r) => setTimeout(r, 400));

  iframe.contentWindow?.focus();
  iframe.contentWindow?.print();
  setTimeout(() => iframe.remove(), 1500);
}

/**
 * PNG snapshot of a rendered node (the live preview prose). Captured at 2×
 * for a crisp image, on the supplied background so transparent regions don't
 * come out black.
 */
export async function exportPng(
  node: HTMLElement,
  currentPath: string,
  background: string,
): Promise<boolean> {
  const dataUrl = await toPng(node, {
    pixelRatio: 2,
    cacheBust: true,
    backgroundColor: background,
  });
  return saveBytes(dataUrlToBytes(dataUrl), baseName(currentPath) + ".png", "PNG", "png");
}

/**
 * Minimal single-document EPUB. One XHTML chapter, a generated nav (EPUB3)
 * plus an NCX (EPUB2 reader compatibility), and a heading-derived table of
 * contents. Math renders best-effort — no KaTeX fonts are embedded to keep
 * the file small.
 */
export async function exportEpub(source: string, currentPath: string): Promise<boolean> {
  const title = documentTitle(source, currentPath);
  const bodyHtml = renderBodyHtml(source, currentPath);
  const headings = extractHeadings(source).filter((h) => h.level <= 3);
  const uid = `urn:markdownish:${baseName(currentPath)}-${title}`.replace(/\s+/g, "-");

  const navItems = headings
    .map((h) => `      <li><a href="index.xhtml#${escapeXml(h.id)}">${escapeXml(h.text)}</a></li>`)
    .join("\n");

  const ncxPoints = headings
    .map(
      (h, i) => `    <navPoint id="nav-${i}" playOrder="${i + 1}">
      <navLabel><text>${escapeXml(h.text)}</text></navLabel>
      <content src="index.xhtml#${escapeXml(h.id)}" />
    </navPoint>`,
    )
    .join("\n");

  const container = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml" />
  </rootfiles>
</container>`;

  const opf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">${escapeXml(uid)}</dc:identifier>
    <dc:title>${escapeXml(title)}</dc:title>
    <dc:language>en</dc:language>
    <meta property="dcterms:modified">2026-01-01T00:00:00Z</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav" />
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml" />
    <item id="style" href="style.css" media-type="text/css" />
    <item id="content" href="index.xhtml" media-type="application/xhtml+xml" />
  </manifest>
  <spine toc="ncx">
    <itemref idref="content" />
  </spine>
</package>`;

  const nav = `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="en">
<head><meta charset="utf-8" /><title>${escapeXml(title)}</title></head>
<body>
  <nav epub:type="toc" id="toc">
    <h1>Contents</h1>
    <ol>
${navItems || `      <li><a href="index.xhtml">${escapeXml(title)}</a></li>`}
    </ol>
  </nav>
</body>
</html>`;

  const ncx = `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head><meta name="dtb:uid" content="${escapeXml(uid)}" /></head>
  <docTitle><text>${escapeXml(title)}</text></docTitle>
  <navMap>
${ncxPoints || `    <navPoint id="nav-0" playOrder="1"><navLabel><text>${escapeXml(title)}</text></navLabel><content src="index.xhtml" /></navPoint>`}
  </navMap>
</ncx>`;

  const epubCss = `
    body { font-family: serif; line-height: 1.6; margin: 5%; }
    h1, h2, h3, h4 { line-height: 1.25; }
    pre { background: #f4f4f4; padding: 0.8em; overflow-x: auto; white-space: pre-wrap; }
    code { font-family: monospace; }
    blockquote { border-left: 3px solid #ccc; margin-left: 0; padding-left: 1em; font-style: italic; }
    img { max-width: 100%; height: auto; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #ddd; padding: 0.4em; }
  `;

  const chapter = `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeXml(title)}</title>
  <link rel="stylesheet" type="text/css" href="style.css" />
</head>
<body>
${bodyHtml}
</body>
</html>`;

  // mimetype MUST be the first entry and stored uncompressed (EPUB OCF spec).
  const zip = zipSync(
    {
      mimetype: [strToU8("application/epub+zip"), { level: 0 }],
      "META-INF/container.xml": strToU8(container),
      "OEBPS/content.opf": strToU8(opf),
      "OEBPS/nav.xhtml": strToU8(nav),
      "OEBPS/toc.ncx": strToU8(ncx),
      "OEBPS/style.css": strToU8(epubCss),
      "OEBPS/index.xhtml": strToU8(chapter),
    },
    { level: 6 },
  );

  return saveBytes(zip, baseName(currentPath) + ".epub", "EPUB", "epub");
}
