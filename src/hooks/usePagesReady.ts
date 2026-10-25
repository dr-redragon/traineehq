import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Whether the database has page text and the pages layout yet
 * (20261025090000_page_text_and_layout.sql).
 *
 * The app deploys on merge but migrations are applied by hand, so for a while
 * the new code runs against the old schema. Reading is harmless there — the
 * columns are simply missing from `select("*")` — but saving text, marking a
 * folder as a page or switching layout would be a 400. Until this says yes,
 * none of those controls are offered and every specialty is drawn classic.
 *
 * `undefined` while checking.
 */
export function usePagesReady() {
  const { data } = useQuery({
    queryKey: ["pages-ready"],
    queryFn: async () => {
      // A missing column is a 400 with an error from PostgREST, unlike the
      // missing table useSchoolsReady has to catch by its status alone.
      const { error, status } = await supabase.from("specialties").select("page_layout").limit(1);
      return !error && !(status >= 400);
    },
    staleTime: Infinity,
    retry: false,
  });
  return data;
}
