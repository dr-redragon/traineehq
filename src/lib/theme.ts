/**
 * Light or dark, and how it reaches the document.
 *
 * Three things used to decide the theme independently and disagree with each
 * other: the inline script in index.html, next-themes' own media-query
 * subscription, and the device's appearance setting. next-themes applied its
 * answer by REMOVING both theme classes from <html> and then adding one back,
 * so every re-evaluation passed through a moment with neither class set — and
 * with no `.dark` on the root, the light tokens are the ones that apply. One
 * such moment is a frame of light on a dark page. Several a second, which is
 * what a machine that keeps re-notifying the media query produces, is a strobe.
 *
 * So: one owner (src/hooks/useTheme.tsx), one write, and the write below never
 * takes the class off. `classList.toggle(force)` either leaves it alone or
 * flips it once, so there is no intermediate state to catch.
 */

export type Theme = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export const THEMES: readonly Theme[] = ["light", "dark", "system"] as const;

/**
 * What someone who has never chosen gets: whatever their device asks for.
 *
 * Named again as a literal in the inline script in index.html, which runs
 * before any module is evaluated and so cannot import it. colorSchemes.test.ts
 * holds the two together.
 */
export const DEFAULT_THEME: Theme = "system";

/**
 * Where the browser copy is kept.
 *
 * The record is `profiles.theme`; this is a CACHE, so the page can paint in
 * the right theme before the profile has been fetched. Read by the inline
 * script in index.html, which is why the name is a bare "theme" — it is also
 * the key next-themes used, so a choice made before this existed carries over.
 */
export const THEME_STORAGE_KEY = "theme";

export const DARK_QUERY = "(prefers-color-scheme: dark)";

export function isKnownTheme(value: string | null | undefined): value is Theme {
  return !!value && (THEMES as readonly string[]).includes(value);
}

export function readThemeCache(): Theme | null {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return isKnownTheme(stored) ? stored : null;
  } catch {
    // Private browsing, or storage disabled.
    return null;
  }
}

export function writeThemeCache(theme: Theme) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // The theme still applies and is still saved to the account; it just will
    // not survive the next first paint without a flash.
  }
}

/** Does the device currently ask for a dark appearance? */
export function prefersDark(): boolean {
  try {
    return window.matchMedia(DARK_QUERY).matches;
  } catch {
    return false;
  }
}

export function resolveTheme(theme: Theme, systemIsDark: boolean): ResolvedTheme {
  if (theme === "system") return systemIsDark ? "dark" : "light";
  return theme;
}

/**
 * Put the resolved theme on <html>.
 *
 * Both writes are conditional. `toggle` with an explicit second argument is
 * idempotent, so calling this in a loop cannot make the page blink; and
 * `colorScheme` is only assigned when it actually changes, because assigning
 * it tells the browser to redraw its own furniture — scrollbars, form
 * controls, the canvas behind the page — and on some browsers also re-answers
 * the `prefers-color-scheme` query that a "system" theme is listening to.
 */
export function applyResolvedTheme(resolved: ResolvedTheme) {
  const root = document.documentElement;
  root.classList.toggle("dark", resolved === "dark");
  if (root.style.colorScheme !== resolved) root.style.colorScheme = resolved;
}
