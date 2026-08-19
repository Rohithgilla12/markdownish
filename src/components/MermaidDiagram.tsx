import { useEffect, useRef, useState } from "react";
import { Maximize2 } from "lucide-react";
import {
  onThemeChange,
  renderMermaid,
  type MermaidError,
  type Recovery,
} from "@/lib/mermaid";
import { MermaidLightbox } from "@/components/MermaidLightbox";

type Props = {
  source: string;
  /**
   * Pre-rendered SVG, used by the export path where rendering has already
   * happened out of band (`renderToStaticMarkup` can't await).
   */
  svg?: string;
};

/**
 * Render `backtick`-quoted spans in a hint as inline code.
 *
 * The hints live in lib/mermaid-error.ts, which has no business importing JSX,
 * so they arrive as plain strings with markdown-style backticks. Without this
 * the reader sees the backticks themselves, which looks like a bug in the very
 * message that's explaining their bug.
 */
function withCodeSpans(text: string) {
  return text.split(/`([^`]+)`/g).map((part, i) =>
    i % 2 === 1 ? <code key={i}>{part}</code> : part,
  );
}

/**
 * Disclose an automatic repair.
 *
 * The diagram renders, but the file is still non-portable: GitHub and every
 * other mermaid renderer will fail or silently truncate at the same character.
 * Saying so costs one muted line and saves someone wondering why the diagram
 * looks different elsewhere.
 */
function RecoveryNote({ recovery }: { recovery: Recovery }) {
  const parts: string[] = [];
  if (recovery.semicolons > 0) {
    parts.push(
      recovery.semicolons === 1 ? "one `;` → `#59;`" : `${recovery.semicolons} \`;\` → \`#59;\``,
    );
  }
  if (recovery.hashes > 0) {
    parts.push(
      recovery.hashes === 1 ? "one `#` → `#35;`" : `${recovery.hashes} \`#\` → \`#35;\``,
    );
  }
  if (parts.length === 0) return null;

  return (
    <figcaption className="mermaid-recovered">
      {withCodeSpans(
        `Auto-escaped for mermaid: ${parts.join(", ")}. Apply it in the source to render the same everywhere.`,
      )}
    </figcaption>
  );
}

/**
 * Don't scale a diagram below this fraction of its natural size to make it fit
 * — past roughly here the 14px node labels stop being readable, and scrolling a
 * legible diagram beats squinting at a whole illegible one.
 */
const MIN_LEGIBLE_SCALE = 0.7;
/** Horizontal padding on `.mermaid-block`, in px — see globals.css. */
const HOST_PADDING = 32;

type State =
  | { kind: "loading" }
  | { kind: "ready"; svg: string; recovered?: Recovery }
  | { kind: "error"; error: MermaidError };

/**
 * One ```mermaid fence, rendered as a diagram.
 *
 * A broken diagram falls back to the source in a code block with the parse
 * error above it — the same information the fence carried before, plus the
 * reason. Swallowing the error and showing an empty box would make a typo in a
 * flowchart look like a bug in the editor.
 */
export function MermaidDiagram({ source, svg }: Props) {
  const [state, setState] = useState<State>(
    svg ? { kind: "ready", svg } : { kind: "loading" },
  );
  // Bumped when the app theme changes, to force a repaint in the new palette.
  const [epoch, setEpoch] = useState(0);
  /** True when the diagram is too wide to scale down legibly, so it scrolls. */
  const [overflowing, setOverflowing] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => onThemeChange(() => setEpoch((n) => n + 1)), []);

  // Fit-or-scroll.
  //
  // Mermaid is configured with `useMaxWidth: false`, so the SVG arrives at its
  // intrinsic size. Two failure modes to avoid: forcing every diagram to the
  // container width shrinks a wide flowchart into an unreadable thumbnail,
  // while never scaling makes a diagram only slightly too wide scroll for no
  // good reason. So scale down to fit when that leaves the diagram at or above
  // MIN_LEGIBLE_SCALE of its natural size, and otherwise leave it alone and let
  // the frame scroll.
  useEffect(() => {
    const host = hostRef.current;
    if (state.kind !== "ready" || !host) return;
    const svg = host.querySelector("svg");
    if (!svg) return;

    // Mermaid writes the intrinsic size into the viewBox; width/height on the
    // element are what we're about to override.
    const viewBox = svg.getAttribute("viewBox")?.split(/[\s,]+/).map(Number);
    const naturalWidth = viewBox && viewBox.length === 4 ? viewBox[2] : svg.clientWidth;
    if (!naturalWidth) return;

    const apply = () => {
      const available = host.clientWidth - HOST_PADDING;
      if (available <= 0) return;
      const scale = available / naturalWidth;
      const fits = scale >= 1;
      const worthScaling = scale >= MIN_LEGIBLE_SCALE;
      if (fits || worthScaling) {
        svg.style.width = "100%";
        svg.style.maxWidth = `${naturalWidth}px`;
        setOverflowing(false);
      } else {
        svg.style.width = `${naturalWidth}px`;
        svg.style.maxWidth = "none";
        setOverflowing(true);
      }
    };

    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(host);
    return () => ro.disconnect();
  }, [state]);

  useEffect(() => {
    if (svg) {
      setState({ kind: "ready", svg });
      return;
    }
    let cancelled = false;
    // Keep the previous diagram on screen while a re-render is in flight —
    // flashing a spinner on every keystroke in the editor is worse than a
    // frame of staleness.
    setState((s) => (s.kind === "ready" ? s : { kind: "loading" }));

    void renderMermaid(source).then((result) => {
      if (cancelled) return;
      setState(
        result.ok
          ? { kind: "ready", svg: result.svg, recovered: result.recovered }
          : { kind: "error", error: result.error },
      );
    });

    return () => {
      cancelled = true;
    };
  }, [source, svg, epoch]);

  if (state.kind === "error") {
    const { headline, excerpt, hint } = state.error;
    return (
      <div className="mermaid-error">
        <div className="mermaid-error-label">Diagram error</div>
        <p className="mermaid-error-headline">{headline}</p>
        {hint && <p className="mermaid-error-hint">{withCodeSpans(hint)}</p>}
        {excerpt && (
          <pre className="mermaid-error-excerpt">
            <code>{excerpt}</code>
          </pre>
        )}
        {/* The source stays available but capped, so a long diagram can't push
            the rest of the document off screen the way the raw error did. */}
        <details className="mermaid-error-source">
          <summary>Diagram source</summary>
          <pre>
            <code>{source}</code>
          </pre>
        </details>
      </div>
    );
  }

  if (state.kind === "loading") {
    return (
      <div className="mermaid-block mermaid-loading" aria-busy="true">
        Rendering diagram…
      </div>
    );
  }

  return (
    <>
      <figure className="mermaid-figure">
        <div
          ref={hostRef}
          className="mermaid-block"
          role="img"
          data-overflowing={overflowing ? "" : undefined}
          // Mermaid's own output. `securityLevel: "strict"` runs it through
          // DOMPurify, and the input is a local file the user is already editing.
          dangerouslySetInnerHTML={{ __html: state.svg }}
        />

        <button
          className="mermaid-expand"
          onClick={() => setFullscreen(true)}
          aria-label="View diagram full window"
          title="View full window"
        >
          <Maximize2 className="h-3 w-3" strokeWidth={1.8} />
          <span>Expand</span>
        </button>

        {state.recovered && <RecoveryNote recovery={state.recovered} />}

      </figure>

      {fullscreen && (
        <MermaidLightbox svg={state.svg} onClose={() => setFullscreen(false)} />
      )}
    </>
  );
}
