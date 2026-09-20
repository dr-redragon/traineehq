import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { orIlikePattern } from "@/lib/queryFilters";

export type SearchKind = "specialty" | "resource" | "contact" | "discussion";

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
 */
export function useGlobalSearch(rawQuery: string, { enabled = true } = {}) {
  const query = useDebounce(rawQuery.trim(), 200);
  const on = enabled && query.length > 0;

  const specialties = useQuery({
    queryKey: ["search-specialties", query],
    queryFn: async () => {
      const { data } = await supabase
        .from("specialties")
        .select("id, short_name, name, icon_name, color")
        .or(`short_name.ilike.${orIlikePattern(query)},name.ilike.${orIlikePattern(query)}`)
        .is("deleted_at", null)
        .limit(4);
      return data ?? [];
    },
    enabled: on,
  });

  const resources = useQuery({
    queryKey: ["search-resources", query],
    queryFn: async () => {
      const { data } = await supabase
        .from("resources")
        .select("id, title, resource_type, subsection_id, subsections!inner(specialty_id, specialties!inner(short_name))")
        .ilike("title", `%${query}%`)
        .limit(6);
      return data ?? [];
    },
    enabled: on,
  });

  const contacts = useQuery({
    queryKey: ["search-contacts", query],
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
        .limit(4);
      return data ?? [];
    },
    enabled: on,
  });

  const discussions = useQuery({
    queryKey: ["search-discussions", query],
    queryFn: async () => {
      const { data } = await supabase
        .from("discussions")
        .select("id, title, specialty_id")
        .ilike("title", `%${query}%`)
        .limit(4);
      return data ?? [];
    },
    enabled: on,
  });

  const hits: SearchHit[] = [];

  for (const s of specialties.data ?? []) {
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
  for (const r of (resources.data ?? []) as {
    id: string; title: string; subsection_id: string;
    subsections: { specialty_id: string; specialties: { short_name: string } };
  }[]) {
    hits.push({
      key: `resource-${r.id}`,
      kind: "resource",
      label: r.title,
      sublabel: r.subsections?.specialties?.short_name,
      path: `/specialty/${r.subsections.specialty_id}?subsection=${r.subsection_id}`,
    });
  }
  for (const c of contacts.data ?? []) {
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
  for (const d of discussions.data ?? []) {
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
    isFetching:
      specialties.isFetching || resources.isFetching ||
      contacts.isFetching || discussions.isFetching,
  };
}
