import { type RefObject, useEffect } from "react";

/**
 * Bidirectional, percent-based scroll sync between two scrollable elements.
 *
 * Pure simple mapping: position = scrollTop / (scrollHeight - clientHeight).
 * When one element scrolls, the other is moved to the matching ratio. A
 * suppression flag guards against the inevitable scroll-listener bounce when
 * we programmatically set scrollTop on the partner.
 *
 * Set `enabled` to false when one of the panes is hidden (editor-only or
 * preview-only view modes) so we don't waste cycles or mis-track scrolls.
 */
export function useScrollSync(
  a: RefObject<HTMLElement | null>,
  b: RefObject<HTMLElement | null>,
  enabled: boolean,
) {
  useEffect(() => {
    if (!enabled) return;
    const elA = a.current;
    const elB = b.current;
    if (!elA || !elB) return;

    let suppress = false;
    let rafId = 0;

    function clearSuppress() {
      suppress = false;
    }

    function mirror(src: HTMLElement, dst: HTMLElement) {
      if (suppress) return;
      const maxSrc = src.scrollHeight - src.clientHeight;
      const maxDst = dst.scrollHeight - dst.clientHeight;
      if (maxSrc <= 0 || maxDst <= 0) return;
      const pct = src.scrollTop / maxSrc;
      suppress = true;
      dst.scrollTop = pct * maxDst;
      // Two-frame wait — the scroll event from setting scrollTop fires async,
      // and a single rAF isn't always enough on macOS Safari/WebKit.
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => requestAnimationFrame(clearSuppress));
    }

    const onA = () => mirror(elA, elB);
    const onB = () => mirror(elB, elA);

    elA.addEventListener("scroll", onA, { passive: true });
    elB.addEventListener("scroll", onB, { passive: true });
    return () => {
      cancelAnimationFrame(rafId);
      elA.removeEventListener("scroll", onA);
      elB.removeEventListener("scroll", onB);
    };
  }, [a, b, enabled]);
}
