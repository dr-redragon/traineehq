import { describe, it, expect } from "vitest";

import {
  DEFAULT_SPECIALTY_COLOR, parseSpecialtyColor, specialtyColorVars,
} from "./specialtyColor";

describe("parseSpecialtyColor", () => {
  it("splits a stored triplet", () => {
    expect(parseSpecialtyColor("8 85% 50%")).toEqual({ h: "8", s: "85%", l: "50%" });
  });

  it("copes with extra whitespace", () => {
    expect(parseSpecialtyColor("  8   85%   50%  ")).toEqual({ h: "8", s: "85%", l: "50%" });
  });

  it("falls back when nothing is stored", () => {
    const [h, s, l] = DEFAULT_SPECIALTY_COLOR.split(" ");
    expect(parseSpecialtyColor(null)).toEqual({ h, s, l });
    expect(parseSpecialtyColor(undefined)).toEqual({ h, s, l });
    expect(parseSpecialtyColor("")).toEqual({ h, s, l });
  });

  it("falls back on a malformed value rather than rendering black", () => {
    const [h, s, l] = DEFAULT_SPECIALTY_COLOR.split(" ");
    for (const bad of ["8 85%", "8", "not a colour at all", "8 85% 50% 20%"]) {
      expect(parseSpecialtyColor(bad), bad).toEqual({ h, s, l });
    }
  });

  it("keeps the very dark value that the dark theme has to lift", () => {
    // T&O: identical to the dark theme's own background, 1.00:1 before the floor.
    expect(parseSpecialtyColor("20 5% 12%")).toEqual({ h: "20", s: "5%", l: "12%" });
  });
});

describe("specialtyColorVars", () => {
  it("produces the three custom properties the stylesheet reads", () => {
    expect(specialtyColorVars("8 85% 50%")).toEqual({
      "--spec-h": "8", "--spec-s": "85%", "--spec-l": "50%",
    });
  });

  it("still produces all three for a missing colour", () => {
    expect(Object.keys(specialtyColorVars(null))).toEqual(["--spec-h", "--spec-s", "--spec-l"]);
  });
});
