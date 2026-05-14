import { useEffect } from "react";

/**
 * Bidirectional, percent-based scroll sync between two scrollable elements.
 *
 * Takes the *elements themselves* (not refs) so the effect re-runs cleanly
 * whenever an element appears, disappears, or is replaced. With refs the
 * effect would only fire when `enabled` flipped — which meant if the
 * elements weren't mounted yet at that moment, the sync silently never
 * started. Tracking elements via React state and passing them in directly
 * makes the dependency explicit and the effect self-healing.
 */
export function useScrollSync(
  a: HTMLElement | null,
  b: HTMLElement | null,
  enabled: boolean,
) {
  useEffect(() => {
    if (!enabled || !a || !b) return;

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
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => requestAnimationFrame(clearSuppress));
    }

    const onA = () => mirror(a, b);
    const onB = () => mirror(b, a);

    a.addEventListener("scroll", onA, { passive: true });
    b.addEventListener("scroll", onB, { passive: true });
    return () => {
      cancelAnimationFrame(rafId);
      a.removeEventListener("scroll", onA);
      b.removeEventListener("scroll", onB);
    };
  }, [a, b, enabled]);
}
