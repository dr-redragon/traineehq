import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser, useUserRole } from "@/hooks/useUserRole";
import { useFacilitatedSpecialties } from "@/hooks/useFacilitatedSpecialties";

export const pendingRequestsQueryKey = ["pending-request-counts"] as const;

export interface PendingRequestCounts {
  /** New people asking for an account. */
  accounts: number;
  /** Signed-in people asking for another specialty. */
  specialties: number;
  total: number;
}

/**
 * How many requests are waiting on the signed-in reviewer, for the badges on
 * the sidebar's Admin Panel / Facilitator Panel link and the panels' Requests
 * tab.
 *
 * Counts only — `head: true` sends no rows. Row-level security already scopes
 * specialty requests to what the reader may review. Account requests are
 * readable by every facilitator, so for a facilitator they are narrowed here
 * to the specialties they run, which is what their panel lists. Polled once a
 * minute so a request submitted while a reviewer is on the site shows up
 * without a reload, and invalidated straight away by a decision.
 */
export function usePendingRequestCounts() {
  const { data: user } = useCurrentUser();
  const { data: role } = useUserRole();
  const isAdmin = role === "admin" || role === "super_admin";
  const isFacilitator = role === "facilitator";
  const { data: facilitated } = useFacilitatedSpecialties(isFacilitator);
  const scopeIds = isFacilitator ? (facilitated ?? []).map((s) => s.id) : null;

  return useQuery({
    queryKey: [...pendingRequestsQueryKey, user?.id, role, scopeIds],
    queryFn: async (): Promise<PendingRequestCounts> => {
      let accountsQuery = supabase
        .from("access_requests")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending");
      if (scopeIds) accountsQuery = accountsQuery.in("specialty_id", scopeIds);

      const [accounts, specialties] = await Promise.all([
        scopeIds && scopeIds.length === 0 ? Promise.resolve({ count: 0 }) : accountsQuery,
        supabase
          .from("specialty_access_requests")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending"),
      ]);
      const a = accounts.count ?? 0;
      const s = specialties.count ?? 0;
      return { accounts: a, specialties: s, total: a + s };
    },
    enabled: !!user && (isAdmin || (isFacilitator && facilitated !== undefined)),
    refetchInterval: 60_000,
  });
}
