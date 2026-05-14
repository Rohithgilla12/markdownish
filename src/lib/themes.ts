export type ThemeId = "vellum" | "vellum-day" | "phosphor" | "sage" | "wabi-sabi";

export type ThemeMeta = {
  id: ThemeId;
  name: string;
  /** One-liner that hints at the personality. */
  description: string;
  /** Font set, shown as a single line under the description. */
  type: string;
  /** Three OKLCH swatches for the picker: background, surface, foil. */
  swatches: { bg: string; surface: string; foil: string };
  /** Light or dark mode — used for the ☀/☾ glyph in the picker. */
  appearance: "dark" | "light";
};

export const THEMES: ThemeMeta[] = [
  {
    id: "vellum",
    name: "Vellum",
    description: "A reading desk after midnight.",
    type: "Spectral · Geist",
    swatches: {
      bg: "oklch(18% 0.022 50)",
      surface: "oklch(26% 0.025 55)",
      foil: "oklch(76% 0.100 65)",
    },
    appearance: "dark",
  },
  {
    id: "vellum-day",
    name: "Vellum Day",
    description: "Riso warmth on rough paper.",
    type: "Spectral · Geist",
    swatches: {
      bg: "oklch(96.5% 0.012 75)",
      surface: "oklch(91% 0.018 70)",
      foil: "oklch(40% 0.16 28)",
    },
    appearance: "light",
  },
  {
    id: "phosphor",
    name: "Phosphor",
    description: "A man page on a CRT.",
    type: "Geist Mono throughout",
    swatches: {
      bg: "oklch(11.5% 0.012 250)",
      surface: "oklch(19% 0.018 250)",
      foil: "oklch(85% 0.16 80)",
    },
    appearance: "dark",
  },
  {
    id: "sage",
    name: "Sage",
    description: "Five steps of one hue, a single ember.",
    type: "Bricolage Grotesque · Geist",
    swatches: {
      bg: "oklch(96% 0.012 145)",
      surface: "oklch(88% 0.022 145)",
      foil: "oklch(64% 0.20 50)",
    },
    appearance: "light",
  },
  {
    id: "wabi-sabi",
    name: "Wabi-Sabi",
    description: "Rice paper, sumi ink, a vermillion seal.",
    type: "Cardo throughout",
    swatches: {
      bg: "oklch(95% 0.012 85)",
      surface: "oklch(89% 0.016 80)",
      foil: "oklch(54% 0.20 30)",
    },
    appearance: "light",
  },
];

export const DEFAULT_THEME: ThemeId = "vellum";

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === "string" && THEMES.some((t) => t.id === value);
}

export function findTheme(id: ThemeId): ThemeMeta {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}
