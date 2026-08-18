/**
 * Turn a mermaid parse failure into something a person can act on.
 *
 * Raw mermaid errors look like this:
 *
 *     Parse error on line 22:
 *     ... act action hash;<br/>idempotency key att
 *     -----------------------^
 *     Expecting 'NEWLINE', ',', '()', 'SOLID_OPEN_ARROW', 'DOTTED_OPEN_ARROW',
 *     'SOLID_ARROW', 'SOLID_ARROW_TOP', ... 24 more lines ..., got 'INVALID'
 *
 * The token dump is the parser's internal state, not advice, and it is long
 * enough to push the diagram source off screen. Keep the line number and the
 * caret excerpt — which do locate the problem — and drop the rest.
 */

export type MermaidError = {
  /** One line: what went wrong and where. */
  headline: string;
  /** The offending source excerpt with mermaid's caret, if it gave one. */
  excerpt?: string;
  /** An actionable suggestion, when the failure matches a known gotcha. */
  hint?: string;
};

/** First meaningful line of a diagram — its type declaration. */
function diagramType(source: string): string {
  for (const line of source.split("\n")) {
    const t = line.trim();
    if (t !== "" && !t.startsWith("%%")) return t;
  }
  return "";
}

/**
 * Known mermaid gotchas that produce baffling parse errors.
 *
 * Semicolon in a sequence diagram is the one worth special-casing: `;`
 * terminates a statement there, so it silently truncates message and note text
 * mid-sentence. Flowchart labels are unaffected, which makes it look arbitrary
 * unless someone tells you. Mermaid's documented escape is the entity code
 * `#59;`.
 */
function findHint(source: string, offendingLine: string | null): string | undefined {
  const type = diagramType(source);
  const isSequence = /^sequenceDiagram\b/.test(type);
  const line = offendingLine ?? "";

  if (isSequence && line.includes(";")) {
    return "In sequence diagrams `;` ends a statement, so it cuts the text off there. Write `#59;` for a literal semicolon.";
  }
  if (isSequence && /<br\s*\/?>/.test(line) && line.includes("#")) {
    return "Entity codes need a closing `;` — for example `#59;`.";
  }
  return undefined;
}

/**
 * Parse a raw mermaid error into a compact, actionable form. Falls back to the
 * first line of whatever mermaid said when the shape is unfamiliar.
 */
export function summariseMermaidError(raw: string, source: string): MermaidError {
  const text = (raw ?? "").trim();
  if (text === "") {
    return { headline: "Diagram failed to render." };
  }

  const lines = text.split("\n");
  const header = lines[0] ?? "";
  const lineNo = /on line (\d+)/.exec(header)?.[1];

  // The excerpt is the lines between the header and the "Expecting ..." dump:
  // typically the source snippet plus a dashes-and-caret pointer.
  const dumpAt = lines.findIndex((l) => /^\s*Expecting\b/.test(l));
  const body = lines.slice(1, dumpAt === -1 ? undefined : dumpAt).filter((l) => l !== "");
  const excerpt = body.length > 0 ? body.join("\n") : undefined;

  // The snippet line is the one that isn't the caret pointer.
  const snippet = body.find((l) => !/^[-\s]*\^?\s*$/.test(l)) ?? null;

  const headline = lineNo
    ? `Parse error on line ${lineNo} of the diagram.`
    : header.replace(/\s+$/, "");

  return { headline, excerpt, hint: findHint(source, snippet) };
}
