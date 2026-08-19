/**
 * Mermaid diagram rendering.
 *
 * The library is ~2.5MB of JavaScript — several times the rest of the app — so
 * it is loaded on first use via dynamic `import()` and never touches the main
 * bundle. A document with no ```mermaid fence never pays for it.
 */

import { summariseMermaidError, type MermaidError } from "@/lib/mermaid-error";
import { escapeSemicolons, escapeStrayHashes } from "@/lib/mermaid-recover";

export type { MermaidError };

type MermaidApi = {
  initialize: (config: Record<string, unknown>) => void;
  render: (id: string, text: string) => Promise<{ svg: string }>;
  parse: (
    text: string,
    opts?: { suppressErrors?: boolean },
  ) => Promise<unknown> | unknown;
};

let modPromise: Promise<MermaidApi> | null = null;
/** The `data-theme` the loaded instance was configured for. */
let configuredFor: string | null = null;
let seq = 0;

/**
 * Build a resolver turning a CSS custom property into a plain `rgb()` string.
 *
 * Every colour token in this app is `oklch()`, and mermaid derives its shades
 * with khroma, which throws `Unsupported color format` on anything outside the
 * legacy sRGB syntaxes. Reading `getComputedStyle().color` is not enough:
 * Chromium preserves the authored colour space, so an `oklch()` token computes
 * back to `oklch(...)`. Painting it into a 1×1 canvas and reading the pixel
 * forces an actual sRGB conversion, which is the one thing khroma will accept.
 */
function makeResolver(): { c: (token: string, fallback: string) => string; done: () => void } {
  const probe = document.createElement("span");
  probe.setAttribute("aria-hidden", "true");
  probe.style.cssText = "position:absolute;visibility:hidden;pointer-events:none";
  document.body.appendChild(probe);

  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  const c = (token: string, fallback: string): string => {
    probe.style.color = "";
    probe.style.color = `var(${token})`;
    const computed = getComputedStyle(probe).color;
    if (!computed) return fallback;
    if (!ctx) return computed;
    try {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = "#000";
      // An unparseable value leaves fillStyle at the previous one, so a failed
      // conversion shows up as black rather than throwing.
      ctx.fillStyle = computed;
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
      return `rgb(${r}, ${g}, ${b})`;
    } catch {
      return fallback;
    }
  };

  return { c, done: () => probe.remove() };
}

function themeConfig(): Record<string, unknown> {
  const { c, done } = makeResolver();
  const bg = c("--color-bg", "rgb(28, 27, 25)");
  const surface = c("--color-surface", "rgb(38, 36, 33)");
  const surface2 = c("--color-surface-2", "rgb(48, 45, 41)");
  const fg = c("--color-fg", "rgb(240, 236, 228)");
  const fgDim = c("--color-fg-dim", "rgb(160, 152, 140)");
  const foil = c("--color-foil", "rgb(201, 160, 99)");
  const rule = c("--color-rule", "rgb(90, 84, 76)");

  const styles = getComputedStyle(document.documentElement);
  const fontFamily =
    styles.getPropertyValue("--font-sans").trim() || "ui-sans-serif, system-ui, sans-serif";
  const fontMono =
    styles.getPropertyValue("--font-mono").trim() || "ui-monospace, monospace";

  done();

  return {
    startOnLoad: false,
    // The rendered markdown is the user's own local files, but there is no
    // reason for a diagram label to be able to run script.
    securityLevel: "strict",
    fontFamily,
    themeVariables: {
      darkMode: styles.colorScheme.includes("dark"),
      background: bg,
      // Nodes read as raised surfaces with a foil edge, matching the prose
      // code-block treatment rather than mermaid's default pastels.
      primaryColor: surface,
      primaryTextColor: fg,
      primaryBorderColor: foil,
      secondaryColor: surface2,
      secondaryTextColor: fg,
      secondaryBorderColor: rule,
      tertiaryColor: bg,
      tertiaryTextColor: fgDim,
      tertiaryBorderColor: rule,
      mainBkg: surface,
      nodeBorder: foil,
      nodeTextColor: fg,
      lineColor: fgDim,
      textColor: fg,
      titleColor: fg,
      edgeLabelBackground: bg,
      clusterBkg: bg,
      clusterBorder: rule,
      fontSize: "14px",
      // Sequence/state/gantt diagrams reach for these directly.
      actorBkg: surface,
      actorBorder: foil,
      actorTextColor: fg,
      labelBoxBkgColor: surface,
      labelBoxBorderColor: rule,
      noteBkgColor: surface2,
      noteTextColor: fg,
      noteBorderColor: rule,
    },
    // useMaxWidth: false keeps the diagram at its intrinsic size instead of
    // squeezing it into the container. A wide flowchart in the split pane
    // would otherwise scale down to an unreadable thumbnail; the frame around
    // it scrolls horizontally instead.
    flowchart: { htmlLabels: true, curve: "basis", useMaxWidth: false },
    sequence: { useMaxWidth: false },
    gantt: { useMaxWidth: false },
    themeCSS: `.nodeLabel code, .edgeLabel code { font-family: ${fontMono}; }`,
  };
}

function currentTheme(): string {
  return document.documentElement.getAttribute("data-theme") ?? "vellum";
}

async function api(): Promise<MermaidApi> {
  if (!modPromise) {
    modPromise = import("mermaid").then((m) => (m.default ?? m) as unknown as MermaidApi);
  }
  const mermaid = await modPromise;

  // Re-initialise when the app theme changed under us, so diagrams repaint in
  // the new palette rather than keeping the one they were first drawn in.
  const theme = currentTheme();
  if (configuredFor !== theme) {
    try {
      mermaid.initialize({ ...themeConfig(), theme: "base" });
    } catch (e) {
      // A token mermaid can't digest shouldn't cost the whole diagram. Fall
      // back to its stock palette, which is always parseable.
      console.warn("mermaid: theme config rejected, using default palette", e);
      mermaid.initialize({ startOnLoad: false, securityLevel: "strict" });
    }
    configuredFor = theme;
  }
  return mermaid;
}

export type MermaidResult =
  | { ok: true; svg: string; recovered?: Recovery }
  | { ok: false; error: MermaidError };

/** Set when a diagram needed an automatic repair to render faithfully. */
export type Recovery = { semicolons: number; hashes: number };

/** Render one diagram to an SVG string. Never throws. */
export async function renderMermaid(source: string): Promise<MermaidResult> {
  const trimmed = source.trim();
  if (trimmed === "") {
    return { ok: false, error: { headline: "Empty diagram." } };
  }

  let mermaid: MermaidApi;
  try {
    mermaid = await api();
  } catch (e) {
    return {
      ok: false,
      error: { headline: "Could not load mermaid.", excerpt: String(e) },
    };
  }

  const isSequence = /^sequenceDiagram\b/m.test(trimmed);

  // A stray `#` doesn't fail — it silently eats the rest of the line — so this
  // repair runs before the first attempt rather than after a failure.
  const hashes = isSequence ? escapeStrayHashes(trimmed) : { text: trimmed, count: 0 };

  const first = await attempt(mermaid, hashes.text);
  if (first.ok) {
    return hashes.count > 0
      ? { ok: true, svg: first.svg, recovered: { semicolons: 0, hashes: hashes.count } }
      : first;
  }

  // `;` terminates a statement in sequence diagrams, so a semicolon in message
  // or note prose truncates it mid-sentence. Retrying with those escaped is
  // safe *because the diagram already failed* — one using `;` legitimately as
  // a separator parses on the first attempt and never reaches here.
  if (isSequence && hashes.text.includes(";")) {
    const semis = escapeSemicolons(hashes.text);
    if (semis.count > 0) {
      const retry = await attempt(mermaid, semis.text);
      if (retry.ok) {
        return {
          ok: true,
          svg: retry.svg,
          recovered: { semicolons: semis.count, hashes: hashes.count },
        };
      }
    }
  }

  return first;
}

/** One render attempt, cleaning up mermaid's scratch nodes on failure. */
async function attempt(mermaid: MermaidApi, source: string): Promise<MermaidResult> {
  seq += 1;
  const id = `mermaid-${seq}`;
  try {
    const { svg } = await mermaid.render(id, source);
    return { ok: true, svg };
  } catch (e) {
    // A failed render can leave mermaid's scratch element behind.
    document.getElementById(`d${id}`)?.remove();
    document.getElementById(id)?.remove();
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: summariseMermaidError(msg, source) };
  }
}

// ────────────────────────────────────────────────────────────────
// Theme change notification — one observer for every diagram on the page.
// ────────────────────────────────────────────────────────────────

const listeners = new Set<() => void>();
let observer: MutationObserver | null = null;

/** Subscribe to `data-theme` changes on <html>. Returns an unsubscribe fn. */
export function onThemeChange(fn: () => void): () => void {
  listeners.add(fn);
  if (!observer) {
    observer = new MutationObserver(() => {
      for (const l of listeners) l();
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
  }
  return () => {
    listeners.delete(fn);
    if (listeners.size === 0 && observer) {
      observer.disconnect();
      observer = null;
    }
  };
}
