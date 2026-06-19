import { describe, it, expect, vi, beforeEach } from "vitest";
import { unzipSync, strFromU8 } from "fflate";

// Tauri boundary — capture what the exporters hand to the native side.
const invokeMock = vi.fn().mockResolvedValue(undefined);
const saveMock = vi.fn().mockResolvedValue("/tmp/out");

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({
  save: (...args: unknown[]) => saveMock(...args),
}));
vi.mock("html-to-image", () => ({
  // 1×1 transparent PNG.
  toPng: vi
    .fn()
    .mockResolvedValue(
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    ),
}));

import { exportHtml, exportEpub, exportPng } from "@/lib/export";

function lastWrite(): { path: string; bytes: Uint8Array } {
  const calls = invokeMock.mock.calls;
  const call = calls[calls.length - 1];
  expect(call[0]).toBe("write_export_file");
  const arg = call[1] as { path: string; data: number[] };
  return { path: arg.path, bytes: Uint8Array.from(arg.data) };
}

beforeEach(() => {
  saveMock.mockResolvedValue("/tmp/out");
});

describe("exportHtml", () => {
  it("renders a standalone document with title, headings and KaTeX math", async () => {
    const src = "# Special Relativity\n\nEnergy is $E = mc^2$.\n\n## Details\n\nmore";
    const ok = await exportHtml(src, "/docs/note.md");
    expect(ok).toBe(true);
    expect(saveMock).toHaveBeenCalled();

    const { path, bytes } = lastWrite();
    expect(path).toBe("/tmp/out");
    const html = new TextDecoder().decode(bytes);

    expect(html).toContain("<!doctype html>");
    expect(html).toContain("<title>Special Relativity</title>"); // title from first H1
    expect(html).toContain("Details");
    expect(html).toContain("katex"); // math actually rendered, not left as $…$
    expect(html).toContain("katex.min.css"); // stylesheet linked
  });

  it("returns false and writes nothing when the save dialog is cancelled", async () => {
    saveMock.mockResolvedValueOnce(null);
    invokeMock.mockClear();
    expect(await exportHtml("# x", "/docs/x.md")).toBe(false);
    expect(invokeMock).not.toHaveBeenCalled();
  });
});

describe("exportEpub", () => {
  it("produces a valid EPUB zip with the mimetype stored first", async () => {
    const ok = await exportEpub("# Book\n\n## Chapter A\n\n## Chapter B", "/docs/book.md");
    expect(ok).toBe(true);

    const { bytes } = lastWrite();
    // Local file header magic.
    expect(new TextDecoder().decode(bytes.slice(0, 2))).toBe("PK");

    const entries = unzipSync(bytes);
    // OCF requires the mimetype entry to exist with exactly this content.
    expect(strFromU8(entries["mimetype"])).toBe("application/epub+zip");
    expect(entries["META-INF/container.xml"]).toBeDefined();
    expect(entries["OEBPS/content.opf"]).toBeDefined();
    expect(entries["OEBPS/toc.ncx"]).toBeDefined();

    const chapter = strFromU8(entries["OEBPS/index.xhtml"]);
    expect(chapter).toContain("Chapter A");
    expect(chapter).toContain("Chapter B");

    // Headings flow into the navigation document.
    expect(strFromU8(entries["OEBPS/nav.xhtml"])).toContain("Chapter A");
  });
});

describe("exportPng", () => {
  it("snapshots a node and writes the decoded PNG bytes", async () => {
    const node = document.createElement("div");
    const ok = await exportPng(node, "/docs/img.md", "#ffffff");
    expect(ok).toBe(true);

    const { bytes } = lastWrite();
    // PNG signature.
    expect(Array.from(bytes.slice(0, 4))).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });
});
