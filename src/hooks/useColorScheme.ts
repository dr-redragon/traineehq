import { useCallback, useEffect, useState } from "react";

import {
  DEFAULT_SCHEME, SCHEME_CLASSES, SCHEME_STORAGE_KEY, isKnownScheme,
} from "@/lib/colorSchemes";

/** Put the scheme on <html>, where `.dark` and `.register-theme` also live. */
function applyScheme(id: string) {
  const el = document.documentElement;
  el.classList.remove(...SCHEME_CLASSES);
  el.classList.add(`scheme-${id}`);
}

function readStored(): string {
  try {
    const stored = localStorage.getItem(SCHEME_STORAGE_KEY);
    return isKnownScheme(stored) ? stored : DEFAULT_SCHEME;
  } catch {
    // Private browsing, or storage disabled. The default is a fine answer.
    return DEFAULT_SCHEME;
  }
}

/**
 * The reader's chosen accent scheme.
 *
 * Kept in localStorage rather than on the profile row, which is the same place
 * and the same reasoning as the light/dark choice next-themes already makes:
 * it is a display preference for this browser, it has to be readable before
 * React mounts so the page does not repaint in the wrong colour, and it should
 * not cost a database round trip on every page load. The trade is that it does
 * not follow you to another device — see the note in Settings.
 *
 * index.html applies the stored value before first paint; this hook keeps
 * React in step with it and writes changes back.
 */
export function useColorScheme() {
  const [scheme, setSchemeState] = useState<string>(DEFAULT_SCHEME);

  // The inline script has already put the class on <html>; this only syncs
  // React's copy, so there is nothing to apply on mount.
  useEffect(() => {
    setSchemeState(readStored());
  }, []);

  const setScheme = useCallback((id: string) => {
    if (!isKnownScheme(id)) return;
    setSchemeState(id);
    applyScheme(id);
    try {
      localStorage.setItem(SCHEME_STORAGE_KEY, id);
    } catch {
      // The scheme still applies for this session; it just will not be
      // remembered. Better than refusing to change it at all.
    }
  }, []);

  return { scheme, setScheme };
}
