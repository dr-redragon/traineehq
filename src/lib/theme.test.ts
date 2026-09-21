import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect, beforeEach } from "vitest";

import {
  DEFAULT_THEME, THEME_STORAGE_KEY, applyResolvedTheme, isKnownTheme, resolveTheme,
} from "./theme";

describe("applyResolvedTheme", () => {
  beforeEach(() => {
    document.documentElement.className = "";
    document.documentElement.style.colorScheme = "";
  });

  it("puts the class Tailwind reads onto the document", () => {
    applyResolvedTheme("dark");
    expect(document.documentElement).toHaveClass("dark");
    expect(document.documentElement.style.colorScheme).toBe("dark");
  });

  it("takes it off again for light", () => {
    applyResolvedTheme("dark");
    applyResolvedTheme("light");
    expect(document.documentElement).not.toHaveClass("dark");
    expect(document.documentElement.style.colorScheme).toBe("light");
  });

  /**
   * This is the flicker, reduced to one assertion.
   *
   * next-themes applied a theme by removing BOTH theme classes and adding one
   * back, so every re-evaluation left <html> momentarily without `.dark` — and
   * without `.dark` the light palette is what applies. Repeated often enough,
   * that is a page strobing between light and dark. A write that only ever
   * toggles cannot produce an in-between state however many times it runs.
   */
  it("leaves the class alone when nothing has changed", () => {
    applyResolvedTheme("dark");
    const seen: boolean[] = [];
    const observer = new MutationObserver(() => {
      seen.push(document.documentElement.classList.contains("dark"));
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style"] });

    for (let i = 0; i < 20; i++) applyResolvedTheme("dark");

    // Flush the observer's microtask queue.
    observer.takeRecords().forEach(() => seen.push(true));
    observer.disconnect();

    expect(document.documentElement).toHaveClass("dark");
    // Whatever the observer saw, it never saw the class absent.
    expect(seen.every(Boolean)).toBe(true);
  });

  it("leaves other classes on the root untouched", () => {
    document.documentElement.classList.add("scheme-sky", "register-theme");
    applyResolvedTheme("dark");
    expect(document.documentElement).toHaveClass("scheme-sky");
    expect(document.documentElement).toHaveClass("register-theme");
  });
});

describe("resolveTheme", () => {
  it("follows the device only under system", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });
});

describe("isKnownTheme", () => {
  it("accepts the three and nothing else", () => {
    expect(isKnownTheme("light")).toBe(true);
    expect(isKnownTheme("dark")).toBe(true);
    expect(isKnownTheme("system")).toBe(true);
    expect(isKnownTheme("midnight")).toBe(false);
    expect(isKnownTheme(null)).toBe(false);
    expect(isKnownTheme("")).toBe(false);
  });
});

/**
 * The pre-paint script in index.html cannot import any of this — it runs
 * before a module exists — so the two are held together here instead. If they
 * drift, the page paints one theme and repaints into the other, which is the
 * flash the script exists to prevent.
 */
describe("the pre-paint script in index.html", () => {
  const html = () => readFileSync(resolve(process.cwd(), "index.html"), "utf8");

  it("reads the key the app caches under", () => {
    expect(html()).toContain(`localStorage.getItem("${THEME_STORAGE_KEY}")`);
  });

  it("falls back to the same default the app does", () => {
    expect(DEFAULT_THEME).toBe("system");
    expect(html()).toContain('|| "system"');
    expect(html()).toContain("prefers-color-scheme: dark");
  });

  it("writes the class the same idempotent way the app does", () => {
    // `add` would be enough on a fresh document, but `toggle` is what keeps
    // the two writers from ever disagreeing — see applyResolvedTheme.
    expect(html()).toMatch(/classList\.toggle\("dark", dark\)/);
    expect(html()).not.toMatch(/classList\.add\("dark"\)/);
  });

  it("sets color-scheme too, so browser furniture does not flash", () => {
    expect(html()).toMatch(/style\.colorScheme/);
  });
});
