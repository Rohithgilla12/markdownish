import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Minimize2 } from "lucide-react";

type Props = {
  svg: string;
  onClose: () => void;
};

/**
 * Full-window view of one diagram.
 *
 * The reading column is a deliberately narrow measure, which is right for prose
 * and wrong for a twelve-node flowchart. This gives the diagram the whole
 * window without disturbing the document's own layout.
 *
 * Rendered through a portal to <body>. `position: fixed` alone isn't enough:
 * the diagram lives deep inside the preview pane, so a z-index set there only
 * competes within that subtree's stacking context — the tab bar, view toggle
 * and status bar all painted straight over the top of it.
 */
export function MermaidLightbox({ svg, onClose }: Props) {
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const previouslyFocused = useRef<Element | null>(null);

  useEffect(() => {
    previouslyFocused.current = document.activeElement;
    closeRef.current?.focus();

    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      // Capture phase + stopPropagation so reading mode's own Escape handler
      // doesn't also fire and drop the reader out of the document entirely.
      e.stopPropagation();
      e.preventDefault();
      onClose();
    }
    document.addEventListener("keydown", onKey, true);

    // The page behind must not scroll while the overlay owns the window.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = previousOverflow;
      if (previouslyFocused.current instanceof HTMLElement) {
        previouslyFocused.current.focus();
      }
    };
  }, [onClose]);

  return createPortal(
    <div
      className="mermaid-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label="Diagram, full window"
      onClick={(e) => {
        // Backdrop only — clicking the diagram itself shouldn't dismiss it.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <button
        ref={closeRef}
        onClick={onClose}
        className="mermaid-lightbox-close"
        aria-label="Close full-window diagram"
      >
        <Minimize2 className="h-3 w-3" strokeWidth={1.8} />
        <span>Close</span>
        <kbd>esc</kbd>
      </button>

      <div
        className="mermaid-lightbox-stage"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    </div>,
    document.body,
  );
}
