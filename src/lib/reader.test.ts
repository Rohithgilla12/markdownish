import { describe, expect, it } from "vitest";
import {
  DEFAULT_PREFS,
  MEASURE_ORDER,
  SCALE_ORDER,
  parsePrefs,
  proseStyle,
  step,
} from "./reader";

describe("parsePrefs", () => {
  it("returns defaults for junk input", () => {
    expect(parsePrefs(null)).toEqual(DEFAULT_PREFS);
    expect(parsePrefs("wide")).toEqual(DEFAULT_PREFS);
    expect(parsePrefs(42)).toEqual(DEFAULT_PREFS);
  });

  it("keeps valid fields and falls back per-field on invalid ones", () => {
    expect(parsePrefs({ measure: "wide", scale: "nope", family: "mono" })).toEqual({
      measure: "wide",
      scale: DEFAULT_PREFS.scale,
      family: "mono",
    });
  });

  it("ignores inherited Object.prototype keys", () => {
    // `constructor` is on the prototype, not the object — a naive `in` check
    // would accept it as a valid measure.
    expect(parsePrefs({ measure: "constructor" }).measure).toBe(DEFAULT_PREFS.measure);
  });
});

describe("step", () => {
  it("moves along the order and clamps at both ends", () => {
    expect(step(SCALE_ORDER, "s", 1)).toBe("m");
    expect(step(SCALE_ORDER, "s", -1)).toBe("s");
    expect(step(MEASURE_ORDER, "full", 1)).toBe("full");
    expect(step(MEASURE_ORDER, "full", -1)).toBe("wide");
  });
});

describe("proseStyle", () => {
  it("emits the three custom properties globals.css reads", () => {
    const style = proseStyle({ measure: "wide", scale: "l", family: "mono" });
    expect(style).toEqual({
      "--prose-measure": "58rem",
      "--prose-size": "18.5px",
      "--prose-family": "var(--font-mono)",
    });
  });
});
