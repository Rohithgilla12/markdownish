/**
 * Reading typography preferences.
 *
 * These resolve to three CSS custom properties consumed by `.prose` in
 * globals.css, so a single style object on the prose container retunes the
 * whole rendered document without any per-element plumbing.
 */

export type Measure = "narrow" | "normal" | "wide" | "full";
export type Scale = "s" | "m" | "l" | "xl";
export type Family = "theme" | "serif" | "sans" | "mono";

export type ReaderPrefs = {
  measure: Measure;
  scale: Scale;
  family: Family;
};

export const DEFAULT_PREFS: ReaderPrefs = {
  measure: "normal",
  scale: "m",
  family: "theme",
};

/**
 * Measures are in `rem`, not `ch`, on purpose. `ch` is font-relative, so the
 * same value produced a cramped column in the sans themes and a sprawling one
 * in Phosphor's all-mono theme. `rem` gives one predictable line length.
 */
export const MEASURES: Record<Measure, { label: string; value: string }> = {
  narrow: { label: "Narrow", value: "36rem" },
  normal: { label: "Normal", value: "46rem" },
  wide: { label: "Wide", value: "58rem" },
  full: { label: "Full", value: "100%" },
};

export const SCALES: Record<Scale, { label: string; value: string }> = {
  s: { label: "S", value: "15px" },
  m: { label: "M", value: "16.5px" },
  l: { label: "L", value: "18.5px" },
  xl: { label: "XL", value: "21px" },
};

export const FAMILIES: Record<Family, { label: string; value: string }> = {
  theme: { label: "Theme", value: "var(--font-sans)" },
  serif: { label: "Serif", value: '"Spectral", Georgia, ui-serif, serif' },
  sans: {
    label: "Sans",
    value: '"Geist Sans", ui-sans-serif, system-ui, -apple-system, sans-serif',
  },
  mono: { label: "Mono", value: "var(--font-mono)" },
};

/**
 * When the outline rail is allowed to show, per measure.
 *
 * Reading mode reserves a rail-width gutter on *both* sides so the prose stays
 * window-centred, which costs ~480px. At the wider measures that's more than a
 * laptop window can spare, and clamping the column the reader just widened is
 * the wrong trade — so the rail only appears once the window can hold the
 * chosen measure plus both gutters. At `full` it never does: picking full width
 * is choosing density over navigation.
 *
 * Static class strings, because Tailwind can't see computed ones.
 */
export const RAIL_CLASS: Record<Measure, string> = {
  narrow: "hidden lg:block",
  normal: "hidden xl:block",
  wide: "hidden 2xl:block",
  full: "hidden",
};

export const MEASURE_ORDER: Measure[] = ["narrow", "normal", "wide", "full"];
export const SCALE_ORDER: Scale[] = ["s", "m", "l", "xl"];
export const FAMILY_ORDER: Family[] = ["theme", "serif", "sans", "mono"];

/** The CSS custom properties `.prose` reads. */
export function proseStyle(prefs: ReaderPrefs): Record<string, string> {
  return {
    "--prose-measure": MEASURES[prefs.measure].value,
    "--prose-size": SCALES[prefs.scale].value,
    "--prose-family": FAMILIES[prefs.family].value,
  };
}

function isKeyOf(obj: object, k: unknown): boolean {
  return typeof k === "string" && Object.prototype.hasOwnProperty.call(obj, k);
}

/** Tolerant parse — an unknown or partial saved value falls back per-field. */
export function parsePrefs(raw: unknown): ReaderPrefs {
  if (!raw || typeof raw !== "object") return DEFAULT_PREFS;
  const o = raw as Record<string, unknown>;
  return {
    measure: isKeyOf(MEASURES, o.measure) ? (o.measure as Measure) : DEFAULT_PREFS.measure,
    scale: isKeyOf(SCALES, o.scale) ? (o.scale as Scale) : DEFAULT_PREFS.scale,
    family: isKeyOf(FAMILIES, o.family) ? (o.family as Family) : DEFAULT_PREFS.family,
  };
}

/** Step a value one place along an ordered list, clamping at both ends. */
export function step<T>(order: T[], current: T, delta: number): T {
  const i = order.indexOf(current);
  if (i < 0) return current;
  return order[Math.min(order.length - 1, Math.max(0, i + delta))];
}
