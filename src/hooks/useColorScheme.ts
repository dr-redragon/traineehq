import { useCallback, useEffect, useState } from "react";

import { useProfile, useUpdateProfile } from "@/hooks/useProfile";
import {
  DEFAULT_SCHEME, SCHEME_CLASSES, SCHEME_STORAGE_KEY, isKnownScheme,
} from "@/lib/colorSchemes";

/** Put the scheme on <html>, where `.dark` and `.register-theme` also live. */
function applyScheme(id: string) {
  const el = document.documentElement;
  const wanted = `scheme-${id}`;
  // Nothing is removed unless it has to be. The old version stripped every
  // scheme class and added one back on each call, which briefly left the root
  // with no scheme at all — the same shape of bug as the theme flicker, one
  // repaint away from showing the base palette instead of the chosen one.
  for (const cls of SCHEME_CLASSES) {
    if (cls !== wanted) el.classList.remove(cls);
  }
  el.classList.add(wanted);
}

function readCache(): string | null {
  try {
    const stored = localStorage.getItem(SCHEME_STORAGE_KEY);
    return isKnownScheme(stored) ? stored : null;
  } catch {
    // Private browsing, or storage disabled.
    return null;
  }
}

function writeCache(id: string) {
  try {
    localStorage.setItem(SCHEME_STORAGE_KEY, id);
  } catch {
    // The scheme still applies and is still saved to the account; it just
    // will not survive the next first paint without a flash.
  }
}

/**
 * The reader's chosen accent scheme, stored on their account.
 *
 * The account is the record: a trainee opens this from a ward machine, a
 * laptop and a phone, and the colour should be theirs rather than the
 * device's. It lives in `profiles.color_scheme`, alongside `profiles.theme`,
 * and both arrive on the single profile read in useProfile.
 *
 * The browser copy is still there, but only as a CACHE. The profile cannot be
 * fetched before the page is painted, so index.html reads localStorage inline
 * to set the class up front — without it every load would draw in the default
 * colour and repaint a frame later. When the profile arrives it wins, and the
 * cache is reconciled to it.
 *
 * A null column means the person has never chosen. That falls back to the
 * cache rather than straight to the default, so a choice made before this was
 * on the account is not thrown away on the device that made it.
 */
export function useColorScheme() {
  const { data: profile, isSuccess } = useProfile();
  const save = useUpdateProfile();
  const [scheme, setSchemeState] = useState<string>(() => readCache() ?? DEFAULT_SCHEME);

  // The account's answer arrives after first paint and overrides the cache.
  useEffect(() => {
    if (!isSuccess) return;
    const stored = profile?.color_scheme;
    const next = isKnownScheme(stored) ? stored : readCache() ?? DEFAULT_SCHEME;
    setSchemeState(next);
    applyScheme(next);
    writeCache(next);
  }, [isSuccess, profile?.color_scheme]);

  const setScheme = useCallback(
    (id: string) => {
      if (!isKnownScheme(id)) return;
      // Applied before the write lands. A colour picker that waits on a round
      // trip feels broken, and there is nothing to undo if the write fails —
      // the page is simply the colour you asked for until you reload.
      setSchemeState(id);
      applyScheme(id);
      writeCache(id);
      save.mutate({ color_scheme: id });
    },
    [save],
  );

  return { scheme, setScheme, isSaving: save.isPending, saveFailed: save.isError };
}

/**
 * Applies the account's scheme on every page.
 *
 * The hook alone was not enough: it only ran where the picker was mounted, so
 * the colour was read and applied on Settings and nowhere else. Mounted once
 * at the root, it puts the class on <html> wherever you land. React Query
 * dedupes the profile read, so the picker using the same hook costs nothing.
 */
export function ColorSchemeSync() {
  useColorScheme();
  return null;
}
