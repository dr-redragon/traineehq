import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { useDeanery } from "@/contexts/DeaneryContext";

export interface VisibleSpecialty {
  id: string;
  name: string;
  short_name: string;
  icon_name: string | null;
  color: string | null;
  parent_specialty_id: string | null;
  sort_order: number | null;
}

/**
 * The specialties this person is allowed to see, in their deanery.
 *
 * Three filters, and each one means something different:
 *
 *   `can_access_specialty` — enforced in the database, not here. Row-level
 *   security already restricts every read to the specialties a person is
 *   assigned to (or, for an admin, their deanery's). Nothing on the client
 *   can widen that, which is why this query does not try to.
 *
 *   `is_active` — an admin's switch for withdrawing a specialty without
 *   deleting it. The database still hands those rows to the people assigned
 *   to them, so this is the filter that actually hides them.
 *
 *   `deleted_at` — soft delete.
 *
 * It exists as a shared hook because the answer has to be the same everywhere.
 * The rail and the search box each used to filter for themselves, and they
 * disagreed: a withdrawn specialty vanished from the rail and stayed in the
 * search results. One query, one key, so React Query serves both from a
 * single fetch and they cannot drift again.
 */
export function useVisibleSpecialties() {
  const { activeDeanery } = useDeanery();

  return useQuery({
    queryKey: ["visible-specialties", activeDeanery?.id],
    queryFn: async () => {
      let query = supabase
        .from("specialties")
        .select("id, name, short_name, icon_name, color, parent_specialty_id, sort_order")
        .eq("is_active", true)
        .is("deleted_at", null)
        .order("sort_order");
      if (activeDeanery) query = query.eq("deanery_id", activeDeanery.id);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as VisibleSpecialty[];
    },
    enabled: !!activeDeanery,
  });
}
