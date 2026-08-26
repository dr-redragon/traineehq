import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useCurrentUser() {
  return useQuery({
    queryKey: ["current-user"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      return user;
    },
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
