import { test, expect, gotoApp } from "./fixtures";

test("boots into the empty state when no folder is given", async ({ page }) => {
  await gotoApp(page);
  await expect(page.getByRole("heading", { name: /markdownish/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /open a folder/i })).toBeVisible();
});

test("opening a folder loads the file tree and selecting a file fills the editor", async ({
  page,
}) => {
  await gotoApp(page, {
    take_launch_folder: () => ({ folder: "/proj", file: null }),
    read_tree: () => ({
      name: "proj",
      path: "/proj",
      isDir: true,
      children: [
        { name: "CLAUDE.md", path: "/proj/CLAUDE.md", isDir: false, children: [] },
        { name: "spec.md", path: "/proj/spec.md", isDir: false, children: [] },
      ],
    }),
    read_text_file: (args) => {
      if (args.path === "/proj/CLAUDE.md") return { content: "# CLAUDE", mtime: 1 };
      if (args.path === "/proj/spec.md") return { content: "# spec\n\nbody", mtime: 1 };
      throw new Error("unexpected read_text_file path: " + String(args.path));
    },
    stat_mtime: () => 1,
    is_self_write: () => false,
    write_text_file: () => 2,
  });

  await expect(page.getByText("CLAUDE.md").first()).toBeVisible();
  await expect(page.getByText("spec.md").first()).toBeVisible();

  await page.getByText("spec.md").first().click();
  const textarea = page.locator("textarea").first();
  await expect(textarea).toHaveValue(/# spec/);
});

test("Cmd+Shift+F runs a folder search and jumping to a match opens the file", async ({
  page,
}) => {
  await gotoApp(page, {
    take_launch_folder: () => ({ folder: "/proj", file: null }),
    read_tree: () => ({
      name: "proj",
      path: "/proj",
      isDir: true,
      children: [
        { name: "spec.md", path: "/proj/spec.md", isDir: false, children: [] },
      ],
    }),
    read_text_file: () => ({
      content:
        "# Spec\n\nThe FOO ticket covers indexes.\nAnother FOO mention here.",
      mtime: 1,
    }),
    stat_mtime: () => 1,
    is_self_write: () => false,
    write_text_file: () => 2,
    search_folder: (args) => ({
      files: [
        {
          path: "/proj/spec.md",
          mtime: 1,
          matches: [
            {
              line: 3,
              col: 5,
              offset: 12,
              length: 3,
              snippet: "The FOO ticket covers indexes.",
              snippetMatchStart: 4,
              snippetMatchEnd: 7,
            },
          ],
          truncated: false,
        },
      ],
      truncatedFiles: false,
      requestId: args.requestId,
      cancelled: false,
    }),
  });

  // Wait for the workspace to be ready (sidebar populated).
  await expect(page.getByText("spec.md").first()).toBeVisible();

  await page.keyboard.press("Meta+Shift+F");

  // The panel input is autofocused. Type the query.
  const findInput = page.getByPlaceholder("Find in folder…");
  await expect(findInput).toBeFocused();
  await findInput.fill("FOO");

  // Match row appears — the snippet text "ticket covers indexes." is enough
  // to disambiguate from the sidebar / editor.
  const matchRow = page.getByText(/ticket covers indexes/);
  await expect(matchRow).toBeVisible();
  await matchRow.click();

  // The editor opens with that file's content.
  await expect(page.locator("textarea").first()).toHaveValue(/Spec/);
});

test("renders block math, leaves currency alone, shows doc stats and the outline", async ({
  page,
}) => {
  await gotoApp(page, {
    take_launch_folder: () => ({ folder: "/proj", file: "/proj/paper.md" }),
    read_tree: () => ({
      name: "proj",
      path: "/proj",
      isDir: true,
      children: [
        { name: "paper.md", path: "/proj/paper.md", isDir: false, children: [] },
      ],
    }),
    read_text_file: () => ({
      content:
        "# Relativity\n\nEnergy, for a body at rest:\n\n$$\nE = mc^2\n$$\n\n## Derivation\n\nRefunds under $50 are automatic; over $500 needs a human.\n\n## Conclusion\n\nDone.",
      mtime: 1,
    }),
    stat_mtime: () => 1,
    is_self_write: () => false,
    write_text_file: () => 2,
  });

  // Preview renders the LaTeX with KaTeX (a `.katex` node only exists if
  // remark-math + rehype-katex actually ran). Only `$$block$$` counts —
  // single-dollar inline math is off, because in these files `$` is almost
  // always currency or a shell prompt.
  await expect(page.locator(".katex-display").first()).toBeVisible();

  // ...and currency survives as literal text rather than becoming an equation.
  // Scoped to the rendered prose — the editor textarea holds the same string.
  await expect(
    page.locator("article.prose").getByText(/Refunds under \$50 are automatic; over \$500/),
  ).toBeVisible();

  // Status bar reports document statistics.
  await expect(page.getByText(/\bwords\b/)).toBeVisible();
  await expect(page.getByText(/min read/)).toBeVisible();

  // Outline toggles on and lists the headings.
  await page.keyboard.press("Meta+Shift+O");
  await expect(page.getByRole("button", { name: "Derivation" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Conclusion" })).toBeVisible();

  // Export menu opens with all four formats.
  await page.getByRole("button", { name: /^Export$/ }).click();
  await expect(page.getByRole("button", { name: /PDF/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /EPUB/ })).toBeVisible();
});

test("Cmd+F opens the in-file find bar", async ({ page }) => {
  await gotoApp(page, {
    take_launch_folder: () => ({ folder: "/proj", file: "/proj/spec.md" }),
    read_tree: () => ({
      name: "proj",
      path: "/proj",
      isDir: true,
      children: [
        { name: "spec.md", path: "/proj/spec.md", isDir: false, children: [] },
      ],
    }),
    read_text_file: () => ({
      content: "the cat sat on the mat in the room",
      mtime: 1,
    }),
    stat_mtime: () => 1,
    is_self_write: () => false,
    write_text_file: () => 2,
  });

  const editor = page.locator("textarea").first();
  await expect(editor).toHaveValue(/the cat/);
  // Wait for the editor to be the single visible textarea — under React
  // StrictMode dev the launch-folder effect fires twice and briefly mounts a
  // second tab; clicking before that settles can trap the Cmd+F keystroke on
  // a stale textarea whose .value hasn't been hydrated yet.
  await expect(page.locator("textarea")).toHaveCount(1);
  await editor.click();

  // Dispatch the keydown directly on the focused textarea. `page.keyboard.press`
  // works on macOS Chromium, but bypassing the engine-level routing is more
  // robust against browser-handled accelerators (Cmd+F is normally the page
  // find shortcut).
  await page.evaluate(() => {
    const ta = document.querySelector("textarea");
    if (!ta) throw new Error("no textarea");
    ta.focus();
    ta.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "f",
        code: "KeyF",
        metaKey: true,
        bubbles: true,
      }),
    );
  });

  // The find bar input has the placeholder "Find…".
  const find = page.getByPlaceholder("Find…");
  await expect(find).toBeFocused();
  await find.fill("the");

  await expect(page.getByText("1 of 3")).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.getByText("2 of 3")).toBeVisible();
});
