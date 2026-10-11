import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/useUserRole";

export interface FacilitatedSpecialty {
  id: string;
  name: string;
  short_name: string;
  icon_name: string | null;
  parent_specialty_id: string | null;
}

/**
 * The specialties this person facilitates, and the children of those.
 *
 * A facilitator of a parent specialty runs its children too — the same rule
 * can_manage_resource() and can_review_specialty() apply in the database —
 * so the children are included here rather than left for each caller to add.
 */
export function useFacilitatedSpecialties(enabled = true) {
  const { data: user } = useCurrentUser();

  return useQuery({
    queryKey: ["facilitated-specialties", user?.id],
    queryFn: async (): Promise<FacilitatedSpecialty[]> => {
      if (!user) return [];
      const { data: links, error } = await supabase
        .from("facilitator_specialties")
        .select("specialty_id")
        .eq("user_id", user.id);
      if (error) throw error;
      const ids = (links ?? []).map((l) => l.specialty_id);
      if (!ids.length) return [];

      const columns = "id, name, short_name, icon_name, parent_specialty_id";
      const [direct, children] = await Promise.all([
        supabase.from("specialties").select(columns).in("id", ids).is("deleted_at", null).order("sort_order"),
        supabase.from("specialties").select(columns).in("parent_specialty_id", ids).is("deleted_at", null).order("sort_order"),
      ]);
      const seen = new Set<string>();
      return [...(direct.data ?? []), ...(children.data ?? [])].filter((s) => {
        if (seen.has(s.id)) return false;
        seen.add(s.id);
        return true;
      });
    },
    enabled: !!user && enabled,
  });
}
