import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/useUserRole";
import type { Database } from "@/integrations/supabase/types";

type ProfileUpdate = Database["public"]["Tables"]["profiles"]["Update"];

/**
 * The one read of the signed-in person's own profile row.
 *
 * Five separate hooks used to fetch this row, each for a single column: the
 * deanery for the whole app, the first name for the dashboard greeting, the
 * accent scheme, the theme, and whether the data-protection notice has been
 * acknowledged. That is five HTTP round trips to Postgres for five fields of
 * one row, and because the row cannot be fetched until `useCurrentUser` has
 * resolved, they all sat behind the same wait — then every widget that keys
 * off the deanery sat behind THEM. The dashboard spent seconds on a waterfall
 * that was really one SELECT.
 *
 * Columns are listed rather than `*` so a column added later does not quietly
 * start travelling to every page.
 */
const COLUMNS = "user_id, first_name, last_name, deanery_id, color_scheme, theme, gdpr_consent_at";

export type Profile = {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  deanery_id: string | null;
  color_scheme: string | null;
  theme: string | null;
  gdpr_consent_at: string | null;
};

export function profileQueryKey(userId: string | undefined) {
  return ["profile", userId] as const;
}

export function useProfile() {
  const { data: user } = useCurrentUser();

  return useQuery({
    queryKey: profileQueryKey(user?.id),
    queryFn: async (): Promise<Profile | null> => {
      if (!user) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select(COLUMNS)
        .eq("user_id", user.id)
        // A profile row is created by a trigger on sign-up, but `maybeSingle`
        // rather than `single` so an account that somehow has none renders the
        // page with defaults instead of throwing on every screen.
        .maybeSingle();
      if (error) throw error;
      return (data as Profile | null) ?? null;
    },
    enabled: !!user,
    // Preferences and a name do not change while you are reading a page, and
    // this row is now on the critical path for every screen.
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Write one or more fields of the profile, and keep the cached row in step.
 *
 * The cache is patched rather than invalidated: a refetch would briefly hand
 * back the old value, and for a preference that is applied the moment you
 * choose it, that is a visible flicker back to what you just changed away
 * from.
 */
export function useUpdateProfile() {
  const { data: user } = useCurrentUser();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (patch: ProfileUpdate) => {
      if (!user) return;
      const { error } = await supabase
        .from("profiles")
        .update(patch)
        .eq("user_id", user.id);
      if (error) throw error;
    },
    onSuccess: (_data, patch) => {
      queryClient.setQueryData(
        profileQueryKey(user?.id),
        (current: Profile | null | undefined) => (current ? { ...current, ...patch } : current),
      );
    },
  });
}
