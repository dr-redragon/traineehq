import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Whether the database has school-scoped contacts yet
 * (20261023090000_school_scoped_contacts.sql).
 *
 * The app deploys on merge but migrations are applied by hand, so for a while
 * the new code runs against the old schema. Filtering or writing `school_id`
 * there is a 400 that empties every specialty's Key Contacts tab and refuses
 * every contact save. Until this says yes, contacts behave as they did before
 * schools: on a specialty, or deanery-wide.
 *
 * `undefined` while checking; callers wait rather than guess.
 */
export function useSchoolsReady() {
  const { data } = useQuery({
    queryKey: ["schools-ready"],
    queryFn: async () => {
      // A missing table is a 404 that supabase-js does not always report as
      // an error, so go by the status too.
      const { error, status } = await supabase.from("schools").select("id").limit(1);
      return !error && status >= 200 && status < 300;
    },
    staleTime: Infinity,
    retry: false,
  });
  return data;
}
