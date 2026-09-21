import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Who is signed in, for keying the queries that belong to them.
 *
 * Reads the session rather than calling `auth.getUser()`. getUser is a round
 * trip to the auth server on every mount, and it sat at the head of the whole
 * dashboard: nothing that is keyed by user id — the profile, the deanery, and
 * then every widget that waits on the deanery — could even be requested until
 * it came back. getSession answers from the stored session, so the first
 * Postgres request now goes out in the same tick as the page.
 *
 * It is not a weaker check. getUser verifies the token server-side, but this
 * hook is not a security boundary: row-level security is what withholds data,
 * and it re-verifies the token on every request regardless of what the client
 * believes. A tampered local session would buy nothing but an empty page.
 * (getSession still refreshes an expired token before answering.)
 */
export function useCurrentUser() {
  return useQuery({
    queryKey: ["current-user"],
    queryFn: async () => {
      const { data } = await supabase.auth.getSession();
      return data.session?.user ?? null;
    },
    // The identity of the signed-in person does not go stale mid-session;
    // AuthCacheSync in App.tsx clears the cache on sign-in and sign-out.
    staleTime: Infinity,
  });
}

export function useUserRole() {
  const { data: user } = useCurrentUser();
  return useQuery({
    queryKey: ["my-role", user?.id],
    queryFn: async () => {
      if (!user) return "trainee" as const;
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
      if (data?.some((r) => r.role === "super_admin")) return "super_admin" as const;
      if (data?.some((r) => r.role === "admin")) return "admin" as const;
      if (data?.some((r) => r.role === "facilitator")) return "facilitator" as const;
      return "trainee" as const;
    },
    enabled: !!user,
  });
}

export function useCanManageSpecialty(specialtyId: string | undefined) {
  const { data: user } = useCurrentUser();
  const { data: role } = useUserRole();
  return useQuery({
    queryKey: ["can-manage", user?.id, specialtyId, role],
    queryFn: async () => {
      if (!user || !specialtyId) return false;
      if (role === "admin" || role === "super_admin") return true;
      if (role !== "facilitator") return false;
      const { data } = await supabase
        .from("facilitator_specialties")
        .select("id")
        .eq("user_id", user.id)
        .eq("specialty_id", specialtyId)
        .maybeSingle();
      return !!data;
    },
    enabled: !!user && !!specialtyId && !!role,
  });
}
