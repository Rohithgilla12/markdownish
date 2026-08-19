/**
 * Last-resort recovery for diagrams mermaid refuses to parse.
 *
 * Only ever applied to source that has *already failed*. That constraint is
 * what makes it safe: `;` genuinely is a statement separator in sequence
 * diagrams — `A->>B: x; A->>B: y` parses as two messages — so rewriting it
 * unconditionally would silently collapse someone's two statements into one.
 * A diagram that parses never reaches this code.
 */

/** Entity codes like `#59;` or `#quot;` end in a semicolon that must survive. */
const ENTITY = /#\w+;/g;

export type Escaped = { text: string; count: number };

/**
 * Escape `#` characters that aren't opening a valid entity code.
 *
 * In sequence diagrams a stray `#` silently swallows the rest of the text:
 * `invoice #4711 tail` renders as `invoice`. That's worse than a parse error —
 * nothing tells you the content vanished. Unlike `;`, a bare `#` has no valid
 * alternative meaning in message prose, so this is applied up front rather than
 * only after a failure: there is no reading of it we could be overriding.
 */
export function escapeStrayHashes(source: string): Escaped {
  let count = 0;
  const text = source
    .split("\n")
    .map((line) => {
      const colon = line.indexOf(":");
      if (colon === -1) return line;
      const head = line.slice(0, colon + 1);
      const rest = line.slice(colon + 1);
      if (!rest.includes("#")) return line;
      // A `#` followed by word characters and a `;` is a real entity code and
      // must be left intact.
      const fixed = rest.replace(/#(\w+;)?/g, (whole, entity) => {
        if (entity) return whole;
        count += 1;
        return "#35;";
      });
      return head + fixed;
    })
    .join("\n");
  return { text, count };
}

/**
 * Escape semicolons appearing in the free text after a `:`.
 *
 * Statement keywords (`participant`, `loop`, `alt`, `end`, …) carry no colon,
 * so they are untouched. Within a message or note, everything past the first
 * colon is prose the author meant literally.
 */
export function escapeSemicolons(source: string): Escaped {
  let count = 0;

  const replaceOutsideEntities = (text: string): string => {
    let out = "";
    let last = 0;
    ENTITY.lastIndex = 0;
    for (let m = ENTITY.exec(text); m; m = ENTITY.exec(text)) {
      out += bump(text.slice(last, m.index)) + m[0];
      last = m.index + m[0].length;
    }
    return out + bump(text.slice(last));
  };

  const bump = (chunk: string): string =>
    chunk.replace(/;/g, () => {
      count += 1;
      return "#59;";
    });

  const text = source
    .split("\n")
    .map((line) => {
      const colon = line.indexOf(":");
      if (colon === -1) return line;
      const head = line.slice(0, colon + 1);
      const rest = line.slice(colon + 1);
      if (!rest.includes(";")) return line;
      return head + replaceOutsideEntities(rest);
    })
    .join("\n");

  return { text, count };
}
