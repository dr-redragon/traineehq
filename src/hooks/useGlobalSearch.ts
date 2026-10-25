import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { orIlikePattern } from "@/lib/queryFilters";
import { pageTextSnippet } from "@/lib/pageText";
import { useVisibleSpecialties } from "@/hooks/useVisibleSpecialties";
import { usePagesReady } from "@/hooks/usePagesReady";
import {
  keepVisible, matchesTerm, toVisibleIdSet,
} from "@/lib/searchVisibility";

export type SearchKind = "specialty" | "page" | "folder" | "resource" | "contact" | "discussion";

/** A resource with the specialty it hangs off, reached through its subsection. */
interface ResourceRow {
  id: string;
  title: string;
  subsection_id: string;
  folder_id: string | null;
  subsections: { specialty_id: string; specialties: { short_name: string } };
}

/** A folder, reached the same way. */
interface FolderRow {
  id: string;
  name: string;
  subsection_id: string;
  parent_folder_id: string | null;
  subsections: { specialty_id: string; specialties: { short_name: string } };
}

/** A section, as a page: found by its name or by its text. */
export interface SectionPageRow {
  id: string;
  name: string;
  body: string | null;
  specialty_id: string;
  specialties: { short_name: string };
}

/** A folder found by its text. Its name is the folder search's to find. */
export interface FolderTextRow {
  id: string;
  name: string;
  body: string | null;
  subsection_id: string;
  subsections: { specialty_id: string; specialties: { short_name: string } };
}

export interface SearchHit {
  /** Unique across kinds, so it can key a flat list. */
  key: string;
  kind: SearchKind;
  label: string;
  sublabel?: string;
  /** Where choosing the result takes you. */
  path: string;
  /**
   * For things that live in the drive: the place that holds it, with the
   * item picked out, so a reader can see what sits next to it. Absent for
   * everything else, where `path` already is the place.
   */
  locatePath?: string;
  /** For a file: its location, with the file opened as well. */
  openPath?: string;
  /** A specialty's own colour, for its icon. */
  color?: string;
  iconName?: string | null;
}

export const KIND_LABELS: Record<SearchKind, string> = {
  specialty: "Specialties",
  page: "Pages",
  folder: "Folders",
  resource: "Resources",
  contact: "Contacts",
  discussion: "Discussions",
};

/** The order groups appear in — most specific first. */
export const KIND_ORDER: SearchKind[] = ["specialty", "page", "folder", "resource", "contact", "discussion"];

/**
 * A place in a specialty's drive. `folder` is the folder to stand in (none is
 * the top of the section), `highlight` the row to pick out once there, and
 * `open` asks for that file to be opened as well.
 */
export function drivePath(
  specialtyId: string,
  subsectionId: string,
  { folder, highlight, open }: { folder?: string | null; highlight?: string; open?: boolean } = {},
): string {
  const params = new URLSearchParams({ subsection: subsectionId });
  if (folder) params.set("folder", folder);
  if (highlight) params.set("highlight", highlight);
  if (open) params.set("open", "1");
  return `/specialty/${specialtyId}?${params}`;
}

/**
 * Results for the text written on sections and folders.
 *
 * A section is a page in either layout, so it is found by its name as well as
 * its text. A folder is found here only by its text: by name it is already a
 * folder result, and listing it twice would be noise. The second line says
 * where in the text the term is, so the reader can tell a page that is about
 * ARCP from one that mentions it once.
 *
 * Both go to the place the text is shown: the top of the section, or inside
 * the folder (which the pages layout turns into the page that holds it).
 */
export function pageHits(
  sections: readonly SectionPageRow[],
  folders: readonly FolderTextRow[],
  query: string,
  { skipFolderIds = new Set<string>() }: { skipFolderIds?: ReadonlySet<string> } = {},
): SearchHit[] {
  const term = query.toLowerCase();
  const describe = (specialty: string | undefined, body: string | null) =>
    [specialty, pageTextSnippet(body, query) ?? undefined].filter(Boolean).join(" · ");

  // Name matches first: a page called "ARCP" is a better answer to "arcp"
  // than one that mentions it in passing.
  const ordered = [...sections].sort(
    (a, b) => Number(b.name.toLowerCase().includes(term)) - Number(a.name.toLowerCase().includes(term)),
  );

  return [
    ...ordered.map((s) => ({
      key: `page-section-${s.id}`,
      kind: "page" as const,
      label: s.name,
      sublabel: describe(s.specialties?.short_name, s.body),
      path: drivePath(s.specialty_id, s.id),
    })),
    ...folders
      .filter((f) => !skipFolderIds.has(f.id))
      .map((f) => ({
        key: `page-folder-${f.id}`,
        kind: "page" as const,
        label: f.name,
        sublabel: describe(f.subsections?.specialties?.short_name, f.body),
        path: drivePath(f.subsections.specialty_id, f.subsection_id, { folder: f.id }),
      })),
  ];
}

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

/**
 * Everything the search box can find: specialties, pages and their text,
 * folders, files, contacts and discussions.
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
export function useGlobalSearch(
  rawQuery: string,
  { enabled = true, full = false }: { enabled?: boolean; full?: boolean } = {},
) {
  const query = useDebounce(rawQuery.trim(), full ? 0 : 200);
  // The dropdown shows a handful of each kind; the results page is where the
  // rest go, so it asks for many more.
  const limit = (n: number) => (full ? 50 : n);

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
  // Page text exists only once 20261025090000 is applied; before that, asking
  // for `body` is a 400 for every keystroke.
  const pagesReady = usePagesReady();

  // No query of its own: the visible specialties are already loaded for the
  // rail, so this is a filter over them. That also makes it impossible for the
  // box to offer a specialty the rail does not list.
  const specialtyHits = useMemo(
    () =>
      !on
        ? []
        : (visibleSpecialties ?? [])
            .filter((s) => matchesTerm(query, s.short_name, s.name))
            .slice(0, full ? 50 : 4),
    [on, visibleSpecialties, query, full],
  );

  // Folders are searched as their own kind rather than being folded in with
  // the files. A folder is where a reader expects to arrive — "the audit
  // folder" is a place, not a document — and it was the one thing in the drive
  // the box could not find, because this hook never asked for the table.
  const folders = useQuery({
    queryKey: ["search-folders", query, idList, full],
    queryFn: async () => {
      const { data } = await supabase
        .from("resource_folders")
        .select("id, name, subsection_id, parent_folder_id, subsections!inner(specialty_id, specialties!inner(short_name))")
        .ilike("name", `%${query}%`)
        .in("subsections.specialty_id", idList)
        .limit(limit(4));
      return data ?? [];
    },
    enabled: on,
  });

  // Sections by name or text, and folders by text. Text can be long, so only
  // what the result line needs comes back — the snippet is cut on the client.
  const sectionPages = useQuery({
    queryKey: ["search-section-pages", query, idList, full],
    queryFn: async () => {
      const pattern = orIlikePattern(query);
      const { data } = await supabase
        .from("subsections")
        .select("id, name, body, specialty_id, specialties!inner(short_name)")
        .or(`name.ilike.${pattern},body.ilike.${pattern}`)
        .in("specialty_id", idList)
        .limit(limit(4));
      return data ?? [];
    },
    enabled: on && !!pagesReady,
  });

  const folderText = useQuery({
    queryKey: ["search-folder-text", query, idList, full],
    queryFn: async () => {
      const { data } = await supabase
        .from("resource_folders")
        .select("id, name, body, subsection_id, subsections!inner(specialty_id, specialties!inner(short_name))")
        .ilike("body", `%${query}%`)
        .in("subsections.specialty_id", idList)
        .limit(limit(4));
      return data ?? [];
    },
    enabled: on && !!pagesReady,
  });

  const resources = useQuery({
    queryKey: ["search-resources", query, idList, full],
    queryFn: async () => {
      const { data } = await supabase
        .from("resources")
        .select("id, title, resource_type, subsection_id, folder_id, subsections!inner(specialty_id, specialties!inner(short_name))")
        .ilike("title", `%${query}%`)
        // Filtering through the inner join, so a file in a withdrawn section
        // is never sent in the first place.
        .in("subsections.specialty_id", idList)
        .limit(limit(6));
      return data ?? [];
    },
    enabled: on,
  });

  const contacts = useQuery({
    queryKey: ["search-contacts", query, idList, full],
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
        .limit(limit(6));
      return data ?? [];
    },
    enabled: on,
  });

  const discussions = useQuery({
    queryKey: ["search-discussions", query, idList, full],
    queryFn: async () => {
      const { data } = await supabase
        .from("discussions")
        .select("id, title, specialty_id")
        .ilike("title", `%${query}%`)
        .in("specialty_id", idList)
        .limit(limit(4));
      return data ?? [];
    },
    enabled: on,
  });

  // The second pass. Every query above is already scoped server-side; this
  // re-applies the same rule to what came back, so a filter that is dropped in
  // a future edit, or an embedded filter that quietly stops applying, narrows
  // the results here instead of widening them on screen.
  const visibleFolders = keepVisible(
    (folders.data ?? []) as unknown as FolderRow[],
    (f) => f.subsections?.specialty_id,
    visibleIds,
  );
  const visibleSectionPages = keepVisible(
    (sectionPages.data ?? []) as unknown as SectionPageRow[],
    (s) => s.specialty_id,
    visibleIds,
  );
  const visibleFolderText = keepVisible(
    (folderText.data ?? []) as unknown as FolderTextRow[],
    (f) => f.subsections?.specialty_id,
    visibleIds,
  );
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
  ).slice(0, limit(4));
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
  hits.push(
    ...pageHits(visibleSectionPages, visibleFolderText, query, {
      skipFolderIds: new Set(visibleFolders.map((f) => f.id)),
    }),
  );
  for (const f of visibleFolders) {
    hits.push({
      key: `folder-${f.id}`,
      kind: "folder",
      label: f.name,
      sublabel: f.subsections?.specialties?.short_name,
      // `folder` opens it rather than just landing on the section it lives in,
      // which for a folder is the whole point of the result.
      path: drivePath(f.subsections.specialty_id, f.subsection_id, { folder: f.id }),
      locatePath: drivePath(f.subsections.specialty_id, f.subsection_id, {
        folder: f.parent_folder_id, highlight: f.id,
      }),
    });
  }
  for (const r of visibleResources) {
    const place = { folder: r.folder_id, highlight: r.id };
    // Into the folder that holds it, with the file picked out, rather than
    // the top of the section with the file somewhere underneath.
    const located = drivePath(r.subsections.specialty_id, r.subsection_id, place);
    hits.push({
      key: `resource-${r.id}`,
      kind: "resource",
      label: r.title,
      sublabel: r.subsections?.specialties?.short_name,
      path: located,
      locatePath: located,
      openPath: drivePath(r.subsections.specialty_id, r.subsection_id, { ...place, open: true }),
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
      scopeFetching || sectionPages.isFetching || folderText.isFetching ||
      folders.isFetching || resources.isFetching ||
      contacts.isFetching || discussions.isFetching,
  };
}
