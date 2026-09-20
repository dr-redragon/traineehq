import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { orIlikePattern } from "@/lib/queryFilters";
import { useVisibleSpecialties } from "@/hooks/useVisibleSpecialties";
import {
  keepVisible, matchesTerm, toVisibleIdSet,
} from "@/lib/searchVisibility";

export type SearchKind = "specialty" | "resource" | "contact" | "discussion";

/** A resource with the specialty it hangs off, reached through its subsection. */
interface ResourceRow {
  id: string;
  title: string;
  subsection_id: string;
  subsections: { specialty_id: string; specialties: { short_name: string } };
}

export interface SearchHit {
  /** Unique across kinds, so it can key a flat list. */
  key: string;
  kind: SearchKind;
  label: string;
  sublabel?: string;
  path: string;
  /** A specialty's own colour, for its icon. */
  color?: string;
  iconName?: string | null;
}

export const KIND_LABELS: Record<SearchKind, string> = {
  specialty: "Specialties",
  resource: "Resources",
  contact: "Contacts",
  discussion: "Discussions",
};

/** The order groups appear in — most specific first. */
export const KIND_ORDER: SearchKind[] = ["specialty", "resource", "contact", "discussion"];

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

/**
 * Everything the search box can find, across the four things worth finding.
 *
 * Pulled out of the old command dialog so the header's inline box and anything
 * else that wants to search run the same four queries and rank them the same
 * way, rather than each growing its own copy.
 *
 * Results come back flat and already ordered by group, because the dropdown
 * has to move a highlight through them with the arrow keys — a nested shape
 * would mean tracking two indices to do that.
 *
 * Everything is scoped to the specialties the person can actually see. The
 * database already refuses rows from specialties they are not assigned to, so
 * that part is not this hook's to enforce; what is enforced here is the rest
 * of the app's rule, that a withdrawn (inactive) specialty and everything
 * inside it stops being findable. Without it the box was the one place a
 * specialty missing from the rail still turned up, along with its files and
 * its threads.
 */
export function useGlobalSearch(rawQuery: string, { enabled = true } = {}) {
  const query = useDebounce(rawQuery.trim(), 200);

  const { data: visibleSpecialties, isSuccess: scopeLoaded, isFetching: scopeFetching } =
    useVisibleSpecialties();
  const visibleIds = useMemo(() => toVisibleIdSet(visibleSpecialties), [visibleSpecialties]);
  // Sorted so the key is stable: an id set in a different order is the same
  // scope and should not refetch or make a second cache entry.
  const idList = useMemo(() => [...visibleIds].sort(), [visibleIds]);

  // Nothing is searched until the scope is known. Searching first and filtering
  // after would flash other people's rows on screen, and searching with an
  // empty scope would ask PostgREST for `in.()`, which is a syntax error.
  const on = enabled && query.length > 0 && scopeLoaded && idList.length > 0;

  // No query of its own: the visible specialties are already loaded for the
  // rail, so this is a filter over them. That also makes it impossible for the
  // box to offer a specialty the rail does not list.
  const specialtyHits = useMemo(
    () =>
      !on
        ? []
        : (visibleSpecialties ?? [])
            .filter((s) => matchesTerm(query, s.short_name, s.name))
            .slice(0, 4),
    [on, visibleSpecialties, query],
  );

  const resources = useQuery({
    queryKey: ["search-resources", query, idList],
    queryFn: async () => {
      const { data } = await supabase
        .from("resources")
        .select("id, title, resource_type, subsection_id, subsections!inner(specialty_id, specialties!inner(short_name))")
        .ilike("title", `%${query}%`)
        // Filtering through the inner join, so a file in a withdrawn section
        // is never sent in the first place.
        .in("subsections.specialty_id", idList)
        .limit(6);
      return data ?? [];
    },
    enabled: on,
  });

  const contacts = useQuery({
    queryKey: ["search-contacts", query, idList],
    queryFn: async () => {
      const { data } = await supabase
        .from("contacts")
        .select("id, name, role, organisation, specialty_id")
        .eq("archived", false)
        .or(
          `name.ilike.${orIlikePattern(query)},` +
          `role.ilike.${orIlikePattern(query)},` +
          `organisation.ilike.${orIlikePattern(query)}`,
        )
        // A contact belongs to a specialty or to the general directory. The
        // second `or` is a separate clause, which PostgREST ands with the
        // first rather than widening it.
        .or(`specialty_id.is.null,specialty_id.in.(${idList.join(",")})`)
        .limit(6);
      return data ?? [];
    },
    enabled: on,
  });

  const discussions = useQuery({
    queryKey: ["search-discussions", query, idList],
    queryFn: async () => {
      const { data } = await supabase
        .from("discussions")
        .select("id, title, specialty_id")
        .ilike("title", `%${query}%`)
        .in("specialty_id", idList)
        .limit(4);
      return data ?? [];
    },
    enabled: on,
  });

  // The second pass. Every query above is already scoped server-side; this
  // re-applies the same rule to what came back, so a filter that is dropped in
  // a future edit, or an embedded filter that quietly stops applying, narrows
  // the results here instead of widening them on screen.
  const visibleResources = keepVisible(
    (resources.data ?? []) as ResourceRow[],
    (r) => r.subsections?.specialty_id,
    visibleIds,
  );
  const visibleContacts = keepVisible(
    contacts.data ?? [],
    (c) => c.specialty_id,
    visibleIds,
    // The general directory belongs to everyone signed in, and the Contacts
    // page lists it for everyone, so the box has to as well.
    { allowUnscoped: true },
  ).slice(0, 4);
  const visibleDiscussions = keepVisible(
    discussions.data ?? [],
    (d) => d.specialty_id,
    visibleIds,
  );

  const hits: SearchHit[] = [];

  for (const s of specialtyHits) {
    hits.push({
      key: `specialty-${s.id}`,
      kind: "specialty",
      label: s.short_name,
      sublabel: s.name !== s.short_name ? s.name : undefined,
      path: `/specialty/${s.id}`,
      color: s.color ?? undefined,
      iconName: s.icon_name,
    });
  }
  for (const r of visibleResources) {
    hits.push({
      key: `resource-${r.id}`,
      kind: "resource",
      label: r.title,
      sublabel: r.subsections?.specialties?.short_name,
      path: `/specialty/${r.subsections.specialty_id}?subsection=${r.subsection_id}`,
    });
  }
  for (const c of visibleContacts) {
    hits.push({
      key: `contact-${c.id}`,
      kind: "contact",
      label: c.name,
      sublabel: [c.role, c.organisation].filter(Boolean).join(" · "),
      // A contact with no specialty has nowhere of its own to go, so it lands
      // on the directory rather than on a dead link.
      path: c.specialty_id ? `/specialty/${c.specialty_id}` : "/contacts",
    });
  }
  for (const d of visibleDiscussions) {
    hits.push({
      key: `discussion-${d.id}`,
      kind: "discussion",
      label: d.title,
      path: `/community/${d.specialty_id}`,
    });
  }

  return {
    /** The debounced term the results actually correspond to. */
    query,
    hits,
    // The scope counts as fetching too, so the box says "Searching…" while it
    // loads rather than "Nothing matches" against a scope it does not have yet.
    isFetching:
      scopeFetching || resources.isFetching ||
      contacts.isFetching || discussions.isFetching,
  };
}
