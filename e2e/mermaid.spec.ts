import { test, expect, gotoApp } from "./fixtures";

// Reading mode swaps under a View Transition; wait for it before screenshotting.
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

type Handler = (args: Record<string, unknown>) => unknown;
function returns(expr: unknown): Handler {
  return new Function(`return () => (${JSON.stringify(expr)})`)() as Handler;
}

/** The flowchart from the report, including the `<br/>` labels. */
const DIAGRAM = [
  "flowchart LR",
  "    C[Customer request] --> O[Orchestrator<br/>durable case state,<br/>budget]",
  "    O <--> M[Model<br/>proposes typed actions]",
  "    O --> G[Tool gateway<br/>schema + policy as code +<br/>ground-truth binding]",
  "    G -->|in bounds| API[Helia APIs<br/>lookup, refund, plan,<br/>account, invoice]",
  "    G -->|out of bounds| Q[Approval queue<br/>in existing console]",
  "    Q -->|human approves:<br/>single-use token,<br/>bound to action hash| G",
  "    Q -->|reject / take over| H[Human support agent<br/>existing console]",
  "    O -->|escalate with full trace| H",
  "    O -.-> A[(Audit spine<br/>append-only, case-keyed:<br/>proposal, verdict, result)]",
  "    G -.-> A",
  "    Q -.-> A",
].join("\n");

const DOC = [
  "# Agent Actions",
  "",
  "A property of the architecture, not a discipline.",
  "",
  "```mermaid",
  DIAGRAM,
  "```",
  "",
  "Today MCP would still resolve to the same topology.",
].join("\n");

const TREE = {
  name: "proj",
  path: "/proj",
  isDir: true,
  children: [{ name: "design.md", path: "/proj/design.md", isDir: false, children: [] }],
};

function handlers() {
  return {
    take_launch_folder: returns({ folder: "/proj", file: "/proj/design.md" }),
    read_tree: returns(TREE),
    read_text_file: returns({ content: DOC, mtime: 1 }),
    stat_mtime: () => 1,
    is_self_write: () => false,
    write_text_file: () => 2,
    allow_folder: () => null,
  };
}

test("renders a mermaid flowchart as an inline diagram", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });

  await gotoApp(page, handlers());

  const block = page.locator("article.prose div.mermaid-block");
  await expect(block).toBeVisible();

  // A real diagram, not the fallback or the error state.
  await expect(block.locator("svg")).toBeVisible({ timeout: 15000 });
  await expect(page.locator(".mermaid-error")).toHaveCount(0);

  // Node labels made it through: `<br/>` became a line break rather than
  // literal text, and the label content survived mermaid's sanitiser.
  // `innerText` is HTMLElement-only; an <svg> needs textContent.
  const svgText =
    (await block.locator("svg").evaluate((el) => el.textContent ?? "")) ?? "";
  expect(svgText).toContain("Orchestrator");
  expect(svgText).toContain("durable case state,");
  expect(svgText).not.toContain("<br/>");

  // Edge labels too.
  expect(svgText).toContain("in bounds");
  expect(svgText).toContain("escalate with full trace");

  await settle(page);
  await page.screenshot({ path: "test-results/shot-mermaid-preview.png" });

  // Reading mode gives the diagram a wide column — the case that should look
  // best, and the one worth eyeballing.
  await page.keyboard.press("Meta+r");
  await expect(page.getByRole("button", { name: /Exit/ })).toBeVisible();
  await settle(page);
  await page.screenshot({ path: "test-results/shot-mermaid-reading.png" });

  // Fit-or-scroll, measured: this diagram is 1459px wide naturally. At the
  // Normal measure it would have to shrink to 0.43 to fit, well past legible,
  // so it scrolls and gets the edge-fade affordance. Widening to Full brings it
  // to 0.80, where it fits and the affordance goes away.
  await expect(block).toHaveAttribute("data-overflowing", "");

  await page.getByRole("button", { name: "Reading typography" }).click();
  await page.getByRole("button", { name: "Full", exact: true }).click();
  await page.keyboard.press("Escape");

  await expect(block).not.toHaveAttribute("data-overflowing", "");
  await settle(page);
  await page.screenshot({ path: "test-results/shot-mermaid-reading-full.png" });

  expect(errors.filter((e) => /mermaid/i.test(e))).toEqual([]);
});

test("a sequence diagram broken by a semicolon explains the fix", async ({ page }) => {
  // Measured: `<br/>` is fine in sequence messages and notes; `;` is not,
  // because it terminates a statement there. A flowchart label with the same
  // `;` renders happily, which is what makes the error baffling unmentored.
  const doc = [
    "# Broken",
    "",
    "```mermaid",
    "sequenceDiagram",
    "    participant Q as Console approval queue",
    "    participant G as Tool gateway",
    "    Q->>G: bound to exact action hash;<br/>idempotency key attached",
    "```",
  ].join("\n");

  await gotoApp(page, {
    ...handlers(),
    read_text_file: returns({ content: doc, mtime: 1 }),
  });

  const err = page.locator(".mermaid-error");
  await expect(err).toBeVisible({ timeout: 15000 });
  await expect(err.getByText("Diagram error")).toBeVisible();

  // The headline locates it, without the parser's expected-token dump.
  await expect(err.locator(".mermaid-error-headline")).toContainText("Parse error on line");
  await expect(err).not.toContainText("SOLID_ARROW");
  await expect(err).not.toContainText("Expecting");

  // And it says what to actually do about it.
  await expect(err.locator(".mermaid-error-hint")).toContainText("#59;");

  // The source is still reachable, just folded away.
  const details = err.locator("details.mermaid-error-source");
  await expect(details).toBeVisible();
  await details.locator("summary").click();
  await expect(details.locator("pre code")).toContainText("sequenceDiagram");

  await settle(page);
  await page.screenshot({ path: "test-results/shot-mermaid-error.png" });
});

test("the same diagram renders once the semicolon is escaped", async ({ page }) => {
  const doc = [
    "# Fixed",
    "",
    "```mermaid",
    "sequenceDiagram",
    "    participant Q as Console approval queue",
    "    participant G as Tool gateway",
    "    Q->>G: bound to exact action hash#59;<br/>idempotency key attached",
    "```",
  ].join("\n");

  await gotoApp(page, {
    ...handlers(),
    read_text_file: returns({ content: doc, mtime: 1 }),
  });

  const block = page.locator("article.prose div.mermaid-block");
  await expect(block.locator("svg")).toBeVisible({ timeout: 15000 });
  await expect(page.locator(".mermaid-error")).toHaveCount(0);

  const svgText =
    (await block.locator("svg").evaluate((el) => el.textContent ?? "")) ?? "";
  // The escape renders as a literal semicolon, and `<br/>` as a line break.
  expect(svgText).toContain("bound to exact action hash;");
  expect(svgText).toContain("idempotency key attached");

  await settle(page);
  await page.screenshot({ path: "test-results/shot-mermaid-sequence-fixed.png" });
});

test("diagram repaints when the theme changes", async ({ page }) => {
  await gotoApp(page, handlers());
  const svg = page.locator("article.prose div.mermaid-block svg");
  await expect(svg).toBeVisible({ timeout: 15000 });

  const before = await svg.getAttribute("id");
  await page.evaluate(() => document.documentElement.setAttribute("data-theme", "sage"));

  // A repaint means a fresh mermaid render, hence a new generated id.
  await expect
    .poll(async () => svg.getAttribute("id"), { timeout: 15000 })
    .not.toBe(before);
  await settle(page);
  await page.screenshot({ path: "test-results/shot-mermaid-sage.png" });
});
