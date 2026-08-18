import { describe, expect, it } from "vitest";
import { summariseMermaidError } from "./mermaid-error";

/** The real shape mermaid throws, abridged only in the token dump. */
const RAW_SEQUENCE = [
  "Parse error on line 22:",
  "... act action hash;<br/>idempotency key att",
  "-----------------------^",
  "Expecting 'NEWLINE', ',', '()', 'SOLID_OPEN_ARROW', 'DOTTED_OPEN_ARROW',",
  "'SOLID_ARROW', 'SOLID_ARROW_TOP', 'SOLID_ARROW_BOTTOM', 'STICK_ARROW_TOP',",
  "'BIDIRECTIONAL_SOLID_ARROW', 'DOTTED_ARROW', 'TXT', got 'INVALID'",
].join("\n");

const SEQUENCE_SOURCE = [
  "sequenceDiagram",
  "    participant Q as Console approval queue",
  "    participant G as Tool gateway",
  "    Q->>G: bound to exact action hash;<br/>idempotency key attached",
].join("\n");

describe("summariseMermaidError", () => {
  it("keeps the line number and drops the token dump", () => {
    const e = summariseMermaidError(RAW_SEQUENCE, SEQUENCE_SOURCE);

    expect(e.headline).toBe("Parse error on line 22 of the diagram.");
    // The excerpt locates the problem; the parser's expected-token list does not.
    expect(e.excerpt).toContain("act action hash;<br/>idempotency key att");
    expect(e.excerpt).toContain("^");
    expect(e.excerpt).not.toContain("SOLID_ARROW");
    expect(e.excerpt).not.toContain("Expecting");
  });

  it("explains the semicolon rule for sequence diagrams", () => {
    const e = summariseMermaidError(RAW_SEQUENCE, SEQUENCE_SOURCE);
    expect(e.hint).toContain("#59;");
    expect(e.hint).toMatch(/sequence diagrams/i);
  });

  it("does not blame the semicolon in a flowchart, where it is legal", () => {
    // Measured: `A[hash;<br/>x] --> B` renders fine as a flowchart.
    const raw = "Parse error on line 2:\n  A[oops\n-------^\nExpecting 'SQE', got 'EOF'";
    const e = summariseMermaidError(raw, "flowchart LR\n  A[hash; x] --> B[ok]");
    expect(e.hint).toBeUndefined();
  });

  it("offers no hint when the offending line has no semicolon", () => {
    const raw = "Parse error on line 3:\n  Q->-G: nope\n------^\nExpecting 'TXT', got 'INVALID'";
    const e = summariseMermaidError(raw, "sequenceDiagram\n  participant Q\n  Q->-G: nope");
    expect(e.hint).toBeUndefined();
  });

  it("looks past comments and blank lines to find the diagram type", () => {
    const raw = "Parse error on line 4:\n  Q->>G: a;b\n----------^\nExpecting 'TXT', got 'INVALID'";
    const src = "\n%% a leading comment\nsequenceDiagram\n  Q->>G: a;b";
    expect(summariseMermaidError(raw, src).hint).toContain("#59;");
  });

  it("falls back to the first line for an unfamiliar error shape", () => {
    const e = summariseMermaidError("Something went sideways\nand more detail", "graph TD");
    expect(e.headline).toBe("Something went sideways");
    expect(e.hint).toBeUndefined();
  });

  it("handles an empty error string", () => {
    expect(summariseMermaidError("", "graph TD").headline).toBe(
      "Diagram failed to render.",
    );
  });
});
