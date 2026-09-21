import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";

import { COLOR_SCHEMES, DEFAULT_SCHEME, SCHEME_CLASSES, isKnownScheme } from "./colorSchemes";

/**
 * The default scheme is named twice: here, and as a literal in the inline
 * script that runs before the bundle does. They cannot be shared — the script
 * has to run before any module is evaluated — so this is what stops them
 * drifting. If they disagree, a first-time visitor paints in one colour and
 * repaints into the other, which is the flash the script exists to prevent.
 */
const PRE_PAINT_PAGES = ["index.html", "e2e/harness/preview.html"];

describe("the default scheme", () => {
  it("names a scheme that exists", () => {
    expect(isKnownScheme(DEFAULT_SCHEME)).toBe(true);
  });

  it.each(PRE_PAINT_PAGES)("matches the fallback baked into %s", (page) => {
    const html = readFileSync(resolve(process.cwd(), page), "utf8");
    const match = html.match(/var fallback = "([a-z0-9-]+)";/);
    expect(match, `no pre-paint fallback found in ${page}`).not.toBeNull();
    expect(match![1]).toBe(DEFAULT_SCHEME);
  });

  it.each(PRE_PAINT_PAGES)("%s always puts a scheme class on <html>", (page) => {
    const html = readFileSync(resolve(process.cwd(), page), "utf8");
    // Unconditional: outside the try, so storage being unavailable still
    // leaves the default on rather than falling through to the base tokens.
    expect(html).toMatch(/classList\.add\("scheme-" \+ name\);/);
  });
});

/*
 * The light/dark half of the same inline script is held to src/lib/theme.ts
 * by src/lib/theme.test.ts. It used to be asserted here, back when the theme
 * was next-themes' business and only the accent scheme was this project's.
 */

describe("the scheme list", () => {
  it("has no duplicate ids", () => {
    const ids = COLOR_SCHEMES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every scheme four swatches as hex", () => {
    for (const scheme of COLOR_SCHEMES) {
      expect(scheme.swatches, scheme.id).toHaveLength(4);
      for (const swatch of scheme.swatches) {
        expect(swatch, `${scheme.id} swatch`).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
  });

  it("derives one class per scheme, which is what the hook removes", () => {
    expect(SCHEME_CLASSES).toEqual(COLOR_SCHEMES.map((s) => `scheme-${s.id}`));
  });

  it("refuses a value that does not name a scheme", () => {
    expect(isKnownScheme("magenta")).toBe(false);
    expect(isKnownScheme(null)).toBe(false);
    expect(isKnownScheme("")).toBe(false);
  });
});
