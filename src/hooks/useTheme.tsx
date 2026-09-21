import {
  createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode,
} from "react";

import { useProfile, useUpdateProfile } from "@/hooks/useProfile";
import {
  DARK_QUERY, DEFAULT_THEME, applyResolvedTheme, isKnownTheme, prefersDark,
  readThemeCache, resolveTheme, writeThemeCache,
  type ResolvedTheme, type Theme,
} from "@/lib/theme";

interface ThemeContextValue {
  /** What was chosen: light, dark, or follow the device. */
  theme: Theme;
  /** What is actually on screen. Differs from `theme` only under "system". */
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: Theme) => void;
  isSaving: boolean;
  /** The theme is applied here, but could not be written to the account. */
  saveFailed: boolean;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * The reader's light/dark choice, stored on their account.
 *
 * REPLACES next-themes, which could not own this any more and was the source
 * of the flicker besides.
 *
 * Why it had to go:
 *
 *  - The choice belongs to the person, not the laptop. A trainee opens this on
 *    a ward machine, a home laptop and a phone; picking "light" once should
 *    hold everywhere, and did not — next-themes keeps the choice in
 *    localStorage, so every new browser started back on "system" and showed
 *    the device's dark appearance to someone who had chosen light. That is the
 *    "the website seems to get confused" half of the report.
 *
 *  - Its writer was not idempotent. `applyTheme` removed BOTH theme classes
 *    from <html> and then added one back, so every re-evaluation passed
 *    through a state with no `.dark` on the root — which is the light palette.
 *    One of those is a frame of light on a dark page; a browser that keeps
 *    re-notifying the media query gets a strobe. See src/lib/theme.ts.
 *
 * What this does instead:
 *
 *  - One owner. The profile is the record, the localStorage copy is a cache
 *    for the first paint (index.html reads it before the bundle exists), and
 *    the class is written in exactly one place, idempotently.
 *
 *  - The device's appearance is consulted ONLY when the choice is "system".
 *    With "light" or "dark" chosen there is no media-query subscription at
 *    all, so nothing the operating system or the browser does to
 *    `prefers-color-scheme` can reach the page. An explicit choice is final.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const { data: profile, isSuccess } = useProfile();
  const save = useUpdateProfile();

  // Seeded from the cache so the very first render already agrees with what
  // the inline script painted; the account's answer arrives a moment later.
  const [theme, setThemeState] = useState<Theme>(() => readThemeCache() ?? DEFAULT_THEME);
  const [systemIsDark, setSystemIsDark] = useState<boolean>(() => prefersDark());

  // The account wins over the cache. A null column means the person has never
  // chosen, which falls back to the cache rather than straight to the default
  // so a choice made on this device before the column existed is not lost.
  useEffect(() => {
    if (!isSuccess) return;
    const stored = profile?.theme;
    const next = isKnownTheme(stored) ? stored : readThemeCache() ?? DEFAULT_THEME;
    setThemeState(next);
    writeThemeCache(next);
  }, [isSuccess, profile?.theme]);

  // Subscribed to only while the choice is "system". Under an explicit choice
  // there is nothing to listen for, and listening anyway is what let the
  // device's appearance argue with the person's.
  useEffect(() => {
    if (theme !== "system") return;
    let media: MediaQueryList;
    try {
      media = window.matchMedia(DARK_QUERY);
    } catch {
      return;
    }
    const onChange = (event: MediaQueryListEvent) => setSystemIsDark(event.matches);
    setSystemIsDark(media.matches);
    // addListener is the deprecated form, and the only one Safari understood
    // before 14. It is still the fallback rather than the primary.
    if (media.addEventListener) {
      media.addEventListener("change", onChange);
      return () => media.removeEventListener("change", onChange);
    }
    media.addListener(onChange);
    return () => media.removeListener(onChange);
  }, [theme]);

  const resolvedTheme = resolveTheme(theme, systemIsDark);

  useEffect(() => {
    applyResolvedTheme(resolvedTheme);
  }, [resolvedTheme]);

  const setTheme = useCallback(
    (next: Theme) => {
      if (!isKnownTheme(next)) return;
      // Applied before the write lands. A theme switch that waits on a round
      // trip feels broken, and there is nothing to undo if the write fails —
      // the page is simply the theme you asked for until you reload.
      setThemeState(next);
      writeThemeCache(next);
      if (next === "system") setSystemIsDark(prefersDark());
      save.mutate({ theme: next });
    },
    [save],
  );

  const value = useMemo(
    () => ({
      theme,
      resolvedTheme,
      setTheme,
      isSaving: save.isPending,
      saveFailed: save.isError,
    }),
    [theme, resolvedTheme, setTheme, save.isPending, save.isError],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useTheme must be used inside <ThemeProvider>");
  return value;
}
