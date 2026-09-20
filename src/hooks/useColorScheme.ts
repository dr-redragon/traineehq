import { useCallback, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/useUserRole";
import {
  DEFAULT_SCHEME, SCHEME_CLASSES, SCHEME_STORAGE_KEY, isKnownScheme,
} from "@/lib/colorSchemes";

/** Put the scheme on <html>, where `.dark` and `.register-theme` also live. */
function applyScheme(id: string) {
  const el = document.documentElement;
  el.classList.remove(...SCHEME_CLASSES);
  el.classList.add(`scheme-${id}`);
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
 * device's. It lives in `profiles.color_scheme`.
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
  const { data: user } = useCurrentUser();
  const queryClient = useQueryClient();
  const [scheme, setSchemeState] = useState<string>(() => readCache() ?? DEFAULT_SCHEME);

  const { data: stored, isSuccess } = useQuery({
    queryKey: ["color-scheme", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("color_scheme")
        .eq("user_id", user!.id)
        .single();
      if (error) throw error;
      return data?.color_scheme ?? null;
    },
    enabled: !!user,
  });

  // The account's answer arrives after first paint and overrides the cache.
  useEffect(() => {
    if (!isSuccess) return;
    const next = isKnownScheme(stored) ? stored : readCache() ?? DEFAULT_SCHEME;
    setSchemeState(next);
    applyScheme(next);
    writeCache(next);
  }, [isSuccess, stored]);

  const save = useMutation({
    mutationFn: async (id: string) => {
      if (!user) return;
      const { error } = await supabase
        .from("profiles")
        .update({ color_scheme: id })
        .eq("user_id", user.id);
      if (error) throw error;
    },
    // Written straight into the cache rather than invalidated: a refetch would
    // briefly hand back the old value and flicker the whole page back.
    onSuccess: (_data, id) => queryClient.setQueryData(["color-scheme", user?.id], id),
  });

  const setScheme = useCallback(
    (id: string) => {
      if (!isKnownScheme(id)) return;
      // Applied before the write lands. A colour picker that waits on a round
      // trip feels broken, and there is nothing to undo if the write fails —
      // the page is simply the colour you asked for until you reload.
      setSchemeState(id);
      applyScheme(id);
      writeCache(id);
      save.mutate(id);
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
