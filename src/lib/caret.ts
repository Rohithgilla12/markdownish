/**
 * Get the pixel coordinates of the caret inside a textarea.
 *
 * Textareas don't expose caret pixel position natively. The classic trick
 * (Jason Bunting's, copied widely in editor tooling): create an invisible
 * mirror div with identical typography + dimensions to the textarea, fill
 * it with `text.slice(0, position)` + a marker span, measure the span's
 * offset, then subtract the textarea's own scroll.
 *
 * Returns position relative to the textarea's top-left, in CSS pixels.
 */

// Computed-style properties we need to copy onto the mirror. Anything that
// affects line wrapping or character advance must match exactly.
const COPIED_PROPS = [
  "boxSizing",
  "width",
  "height",
  "overflowX",
  "overflowY",
  "borderTopWidth",
  "borderRightWidth",
  "borderBottomWidth",
  "borderLeftWidth",
  "borderStyle",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "fontStyle",
  "fontVariant",
  "fontWeight",
  "fontStretch",
  "fontSize",
  "fontSizeAdjust",
  "lineHeight",
  "fontFamily",
  "textAlign",
  "textTransform",
  "textIndent",
  "textDecoration",
  "letterSpacing",
  "wordSpacing",
  "tabSize",
  "MozTabSize",
  "whiteSpace",
  "wordBreak",
  "wordWrap",
  "overflowWrap",
] as const;

export type CaretCoords = { top: number; left: number; height: number };

export function getCaretCoordinates(
  textarea: HTMLTextAreaElement,
  position: number,
): CaretCoords {
  const computed = window.getComputedStyle(textarea);

  const mirror = document.createElement("div");
  mirror.style.position = "absolute";
  mirror.style.visibility = "hidden";
  mirror.style.whiteSpace = "pre-wrap";
  mirror.style.wordWrap = "break-word";
  mirror.style.top = "0";
  mirror.style.left = "-9999px";

  for (const prop of COPIED_PROPS) {
    // `as any` because TS's typing of CSSStyleDeclaration is conservative
    // about indexable keys — we know the props match by name.
    (mirror.style as unknown as Record<string, string>)[prop] = computed[
      prop as keyof CSSStyleDeclaration
    ] as string;
  }

  // Replicate the textarea's content up to the caret, then drop in a marker
  // span. Whitespace must be preserved verbatim, including a trailing space
  // (a single character) so the marker advances correctly on empty trailing
  // lines.
  mirror.textContent = textarea.value.substring(0, position);
  const marker = document.createElement("span");
  marker.textContent = textarea.value.substring(position) || ".";
  mirror.appendChild(marker);

  document.body.appendChild(mirror);
  const coords: CaretCoords = {
    top: marker.offsetTop - textarea.scrollTop,
    left: marker.offsetLeft - textarea.scrollLeft,
    height: parseInt(computed.lineHeight, 10) || parseInt(computed.fontSize, 10) * 1.4,
  };
  document.body.removeChild(mirror);

  return coords;
}
