import { describe, expect, it } from "vitest";
import { escapeSemicolons, escapeStrayHashes } from "./mermaid-recover";

describe("escapeSemicolons", () => {
  it("escapes a semicolon in note prose", () => {
    const src =
      "sequenceDiagram\n    Note over G: verify token matches<br/>exact action hash;<br/>idempotency key attached";
    const { text, count } = escapeSemicolons(src);

    expect(count).toBe(1);
    expect(text).toContain("exact action hash#59;<br/>idempotency");
    // The structural part of the line is untouched.
    expect(text).toContain("Note over G:");
  });

  it("escapes semicolons in message text", () => {
    const { text, count } = escapeSemicolons("sequenceDiagram\n  A->>B: one; two; three");
    expect(count).toBe(2);
    expect(text).toBe("sequenceDiagram\n  A->>B: one#59; two#59; three");
  });

  it("leaves lines without a colon alone", () => {
    const src = "sequenceDiagram\n  participant A\n  loop every 5s\n  end";
    expect(escapeSemicolons(src)).toEqual({ text: src, count: 0 });
  });

  it("does not double-escape an existing entity code", () => {
    const src = "sequenceDiagram\n  A->>B: already #59; escaped";
    const { text, count } = escapeSemicolons(src);
    expect(count).toBe(0);
    expect(text).toBe(src);
  });

  it("escapes a bare semicolon that sits beside an entity code", () => {
    const { text, count } = escapeSemicolons("sequenceDiagram\n  A->>B: #59; and; more");
    expect(count).toBe(1);
    expect(text).toBe("sequenceDiagram\n  A->>B: #59; and#59; more");
  });

  it("only touches text after the first colon", () => {
    // A colon inside the prose must not restart the scan.
    const { text } = escapeSemicolons("sequenceDiagram\n  A->>B: ratio 1:2; done");
    expect(text).toBe("sequenceDiagram\n  A->>B: ratio 1:2#59; done");
  });

  it("reports zero for source with no semicolons", () => {
    const src = "sequenceDiagram\n  A->>B: clean";
    expect(escapeSemicolons(src)).toEqual({ text: src, count: 0 });
  });

  it("handles the appendix note verbatim", () => {
    const src =
      "    Note over G: verify token matches<br/>exact action hash;<br/>idempotency key attached";
    const { text, count } = escapeSemicolons(src);
    expect(count).toBe(1);
    expect(text).toBe(
      "    Note over G: verify token matches<br/>exact action hash#59;<br/>idempotency key attached",
    );
  });
});

describe("escapeStrayHashes", () => {
  it("escapes a bare hash that would otherwise eat the rest of the line", () => {
    // Measured: `M->>O: invoice #4711 tail` renders as just "invoice".
    const { text, count } = escapeStrayHashes(
      "sequenceDiagram\n  M->>O: propose refund($180, invoice #4711)",
    );
    expect(count).toBe(1);
    expect(text).toContain("invoice #35;4711)");
  });

  it("leaves real entity codes alone", () => {
    const src = "sequenceDiagram\n  A->>B: say #quot;hi#quot; and #59; done";
    expect(escapeStrayHashes(src)).toEqual({ text: src, count: 0 });
  });

  it("escapes a stray hash sitting next to an entity code", () => {
    const { text, count } = escapeStrayHashes("sequenceDiagram\n  A->>B: #quot;x#quot; #4711");
    expect(count).toBe(1);
    expect(text).toBe("sequenceDiagram\n  A->>B: #quot;x#quot; #35;4711");
  });

  it("ignores lines with no colon", () => {
    const src = "sequenceDiagram\n  participant A\n  autonumber";
    expect(escapeStrayHashes(src)).toEqual({ text: src, count: 0 });
  });

  it("composes with semicolon escaping without corrupting either", () => {
    const src = "sequenceDiagram\n  A->>B: invoice #4711 urgent; now";
    const hashed = escapeStrayHashes(src);
    const both = escapeSemicolons(hashed.text);
    expect(hashed.count).toBe(1);
    // The `;` closing the `#35;` we just introduced must not be re-escaped.
    expect(both.count).toBe(1);
    expect(both.text).toBe("sequenceDiagram\n  A->>B: invoice #35;4711 urgent#59; now");
  });

  it("leaves a digit run that already looks like a numeric entity", () => {
    // `#4711;` is a syntactically valid numeric entity, so it is genuinely
    // ambiguous: an invoice number followed by a semicolon, or codepoint 4711.
    // Not touching it is the conservative call — rewriting a deliberate entity
    // would be a corruption we could never detect, whereas this case stays
    // exactly as the author typed it.
    const src = "sequenceDiagram\n  A->>B: invoice #4711; urgent";
    expect(escapeStrayHashes(src)).toEqual({ text: src, count: 0 });
  });
});
