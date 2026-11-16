import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Who is signed in, for keying the queries that belong to them.
 *
 * Reads the stored session rather than calling `auth.getUser()`, which is a
 * round trip to the auth server before anything keyed by user id can even be
 * requested. This is not a security boundary: row-level security withholds the
 * data and re-verifies the token on every request, so a tampered local session
 * buys nothing but an empty page.
 */
export function useCurrentUser() {
  return useQuery({
    queryKey: ["current-user"],
    queryFn: async () => {
      const { data } = await supabase.auth.getSession();
      return data.session?.user ?? null;
    },
    // AuthCacheSync in App.tsx clears the cache on sign-in and sign-out.
    staleTime: Infinity,
  });
}
