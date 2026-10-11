import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser, useUserRole } from "@/hooks/useUserRole";

export const pendingRequestsQueryKey = ["pending-request-counts"] as const;

export interface PendingRequestCounts {
  /** New people asking for an account. */
  accounts: number;
  /** Signed-in people asking for another specialty. */
  specialties: number;
  total: number;
}

/**
 * How many requests are waiting on an admin, for the badges on the sidebar's
 * Admin Panel link and the panel's Requests tab.
 *
 * Counts only — `head: true` sends no rows — and only for admins, the people
 * who can open the panel. Row-level security already scopes both tables to
 * what the reader may review, so the number is the reader's own queue. It is
 * polled once a minute so a request submitted while an admin is on the site
 * shows up without a reload, and invalidated straight away by a decision.
 */
export function usePendingRequestCounts() {
  const { data: user } = useCurrentUser();
  const { data: role } = useUserRole();
  const isAdmin = role === "admin" || role === "super_admin";

  return useQuery({
    queryKey: [...pendingRequestsQueryKey, user?.id],
    queryFn: async (): Promise<PendingRequestCounts> => {
      const [accounts, specialties] = await Promise.all([
        supabase
          .from("access_requests")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending"),
        supabase
          .from("specialty_access_requests")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending"),
      ]);
      const a = accounts.count ?? 0;
      const s = specialties.count ?? 0;
      return { accounts: a, specialties: s, total: a + s };
    },
    enabled: !!user && isAdmin,
    refetchInterval: 60_000,
  });
}
