import { test, expect, gotoApp } from "./fixtures";

/**
 * Wait out the reading-mode View Transition.
 *
 * While one is running Chromium composites snapshots of both the old and new
 * DOM, so a screenshot taken then is a double exposure. `prefers-reduced-motion`
 * doesn't help: globals.css sets `animation: none` on the pseudo-elements, which
 * removes the animation but doesn't end the transition any sooner. Waiting for
 * every running animation to settle is the reliable signal.
 */
async function settle(page: import("@playwright/test").Page): Promise<void> {
  await page.waitForFunction(
    () =>
      document
        .getAnimations()
        .every((a) => a.playState === "finished" || a.playState === "idle"),
    undefined,
    { timeout: 5000 },
  );
}

/**
 * Reading-mode and preview typography, plus the folder-watcher wiring.
 *
 * The document below is deliberately the awkward kind this editor exists for:
 * a bold-prefixed numbered list of multi-sentence rules, inline code, currency
 * amounts either side of a dollar sign, an emphasis-led lede, and a table.
 */
const DOC = [
  "# Helia Agent Actions — Team Standard v1",
  "",
  "*Applies to every agent action, both teams, no exceptions.* Amendments by PR to this page, approved by the platform group and both team leads. Anything not written down here is not policy, and anything policy-adjacent that is not in this document should be treated as an open question rather than an assumption.",
  "",
  "1. **Every action goes through the gateway.** No agent code holds Helia API credentials. If your action cannot be expressed as a registered tool, it does not ship.",
  "2. **Register, don't wire.** A tool = typed schema + risk tier (`read` / `reversible` / `irreversible`) + policy bounds + named owner, registered in the gateway.",
  "3. **The model proposes; code decides.** Model output is never executed raw. Mutating parameters must bind to values read from account data.",
  "4. **Know your line.** *Autonomous:* in-bounds refunds (≤ $50, ≤ amount paid, ≤ 1 per customer per 90 days). Refunds over $500 and billing changes: **always** human.",
  "",
  "## Escalation",
  "",
  "A human must never have to re-investigate what the agent already did.",
  "",
  "| Tier | Approval | Log |",
  "| --- | --- | --- |",
  "| `read` | none | sampled |",
  "| `irreversible` | human token | full trace |",
  "",
  "### Worked example",
  "",
  "```ts",
  "const verdict = await gateway.propose({ tool: 'refund', amount: 4200 });",
  "if (!verdict.approved) throw new EscalationRequired(verdict.reason);",
  "```",
  "",
  "> Escalation is always available, never gated, and carries the full trace.",
  "",
  "## Shipping a change",
  "",
  "- PR and review",
  "- Replay eval against the recorded set",
  "- Owner sign-off",
].join("\n");

const TREE = {
  name: "proj",
  path: "/proj",
  isDir: true,
  children: [
    { name: "README.md", path: "/proj/README.md", isDir: false, children: [] },
    {
      name: "03-team-standard.md",
      path: "/proj/03-team-standard.md",
      isDir: false,
      children: [],
    },
  ],
};

type Handler = (args: Record<string, unknown>) => unknown;

/**
 * `gotoApp` serialises each handler with `.toString()` and rebuilds it inside
 * the page, so a handler cannot close over anything from the test process.
 * This bakes the value into the source instead.
 */
function returns(expr: unknown): Handler {
  return new Function(`return () => (${JSON.stringify(expr)})`)() as Handler;
}

/** Same idea, but for a handler body written as source. */
function handler(body: string): Handler {
  return new Function(`return () => { ${body} }`)() as Handler;
}

function docHandlers(): Record<string, Handler> {
  return {
    take_launch_folder: returns({
      folder: "/proj",
      file: "/proj/03-team-standard.md",
    }),
    read_tree: returns(TREE),
    read_text_file: returns({ content: DOC, mtime: 1 }),
    stat_mtime: () => 1,
    is_self_write: () => false,
    write_text_file: () => 2,
    allow_folder: () => null,
  };
}

test("preview pane renders the document with the new measure", async ({ page }) => {
  await gotoApp(page, docHandlers());

  const prose = page.locator("article.prose");
  await expect(prose).toBeVisible();

  // Currency survived — the whole point of turning single-dollar math off.
  await expect(prose.getByText(/≤ \$50, ≤ amount paid/)).toBeVisible();
  await expect(prose.getByText(/Refunds over \$500/)).toBeVisible();
  await expect(page.locator(".katex")).toHaveCount(0);

  // Measure comes from the reader prefs custom property, not a `ch` value.
  const measure = await prose.evaluate((el) =>
    getComputedStyle(el).getPropertyValue("--prose-measure").trim(),
  );
  expect(measure).toBe("46rem");

  await settle(page);

  await page.screenshot({ path: "test-results/shot-preview-split.png", fullPage: false });
});

test("reading mode: chrome, wider measure, drop cap suppressed on an emphasis lede", async ({
  page,
}) => {
  await gotoApp(page, docHandlers());

  await expect(page.locator("article.prose")).toBeVisible();
  await page.keyboard.press("Meta+r");

  // Reading mode swaps in under a View Transition, during which both DOM trees
  // briefly coexist — so wait for the split view to be gone before asserting
  // on anything by text, and scope header assertions to the header itself.
  await expect(page.getByRole("button", { name: /Exit/ })).toBeVisible();
  await expect(page.locator("textarea")).toHaveCount(0);

  const header = page.locator("header").first();
  await expect(header.getByText("03-team-standard.md")).toBeVisible();
  await expect(header.getByText(/min read/)).toBeVisible();
  await expect(header.getByText(/\bwords\b/)).toBeVisible();

  // Outline rail is in flow, not fixed over the text.
  const outline = page.getByRole("navigation", { name: "Outline" });
  await expect(outline).toBeVisible();
  expect(await outline.evaluate((el) => getComputedStyle(el).position)).not.toBe("fixed");

  // The lede starts with emphasis, so it must NOT get a drop cap.
  await expect(page.locator("p.has-dropcap")).toHaveCount(0);

  await settle(page);

  await page.screenshot({ path: "test-results/shot-reading-default.png" });

  // Widen and enlarge via the keyboard, then confirm it took.
  await page.keyboard.press("]");
  await page.keyboard.press("+");
  const prose = page.locator("article.prose");
  expect(
    await prose.evaluate((el) =>
      getComputedStyle(el).getPropertyValue("--prose-measure").trim(),
    ),
  ).toBe("58rem");

  await settle(page);

  await page.screenshot({ path: "test-results/shot-reading-wide.png" });

  // The controls popover opens and reflects the new state.
  await page.getByRole("button", { name: "Reading typography" }).click();
  await expect(page.getByRole("button", { name: "Wide", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await settle(page);
  await page.screenshot({ path: "test-results/shot-reading-controls.png" });
});

test("drop cap appears on a long plain-text lede", async ({ page }) => {
  const plain = [
    "# A Quiet Morning",
    "",
    "Winter arrived without ceremony that year, settling over the harbour in a single overnight hush that muffled the cranes and softened every hard edge of the container yard until the whole place looked briefly, improbably gentle.",
  ].join("\n");

  await gotoApp(page, {
    take_launch_folder: returns({ folder: "/proj", file: "/proj/a.md" }),
    read_tree: returns({
      name: "proj",
      path: "/proj",
      isDir: true,
      children: [{ name: "a.md", path: "/proj/a.md", isDir: false, children: [] }],
    }),
    read_text_file: returns({ content: plain, mtime: 1 }),
    stat_mtime: () => 1,
    is_self_write: () => false,
    allow_folder: () => null,
  });

  await expect(page.locator("article.prose")).toBeVisible();
  await page.keyboard.press("Meta+r");
  await expect(page.locator("p.has-dropcap")).toHaveCount(1);
  await settle(page);
  await page.screenshot({ path: "test-results/shot-reading-dropcap.png" });
});

test("a new file on disk shows up in the sidebar without a manual refresh", async ({
  page,
  pw,
}) => {
  await gotoApp(page, {
    take_launch_folder: returns({ folder: "/proj", file: null }),
    // The tree only gains the new file once the test flips `__newFileOnDisk`,
    // so the sidebar can only show it via a watcher-driven re-read. Keying off
    // a read counter instead would be flaky: mount legitimately reads twice.
    read_tree: handler(`
      const children = [{ name: "README.md", path: "/proj/README.md", isDir: false, children: [] }];
      if (window.__newFileOnDisk) {
        children.push({ name: "brand-new.md", path: "/proj/brand-new.md", isDir: false, children: [] });
      }
      return { name: "proj", path: "/proj", isDir: true, children };
    `),
    stat_mtime: () => 1,
    is_self_write: () => false,
    allow_folder: () => null,
  });

  await expect(page.getByRole("button", { name: /README\.md/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /brand-new\.md/ })).toHaveCount(0);

  // Now the file exists on disk, and the watcher reports the create the way
  // notify does. Nothing else prompts a re-read.
  await page.evaluate(() => {
    window.__newFileOnDisk = true;
  });
  await pw.emitWatcher({
    type: { create: { kind: "file" } },
    paths: ["/proj/brand-new.md"],
  });

  await expect(page.getByRole("button", { name: /brand-new\.md/ })).toBeVisible({
    timeout: 5000,
  });
  await settle(page);
  await page.screenshot({ path: "test-results/shot-watcher-newfile.png" });
});
