/**
 * Column sorting for the file browser.
 *
 * Google Drive and OneDrive both let you click Name, Size or Modified to
 * reorder what you are looking at, and both keep folders above files whichever
 * way you sort. This browser had the same four column headings drawn as plain
 * labels, so the only order available was the manual one, and finding the
 * newest file in a section meant reading every row.
 *
 * Manual order is still the default and still the thing drag-and-drop writes,
 * so sorting is a third state rather than a replacement: a column cycles
 * ascending, descending, then back off to the order someone arranged by hand.
 * Drive has no equivalent of that last step because Drive has no hand-arranged
 * order to return to.
 */

export type SortKey = "name" | "type" | "size" | "updated";
export type SortDir = "asc" | "desc";

export interface SortState {
  key: SortKey;
  dir: SortDir;
}

/** The shape either kind of row reduces to for the purpose of ordering. */
export interface SortableItem {
  kind: "folder" | "file";
  name: string;
  /** A file's resource_type. Folders have none. */
  type?: string | null;
  /** Bytes. Null for a link, an embed, or a folder. */
  size?: number | null;
  /** ISO timestamp. */
  updated?: string | null;
  /** The hand-arranged position, used when nothing is sorted. */
  sortOrder?: number | null;
}

/**
 * Clicking a heading: ascending, then descending, then back to manual order.
 *
 * Clicking a different heading always starts that one ascending rather than
 * inheriting the previous direction, which is what both Drive and Finder do
 * and what people expect when they move between columns.
 */
export function nextSort(current: SortState | null, key: SortKey): SortState | null {
  if (!current || current.key !== key) return { key, dir: "asc" };
  if (current.dir === "asc") return { key, dir: "desc" };
  return null;
}

/** Nulls last, whichever direction — an unknown size is not "the smallest". */
function compareNullable(a: number | null, b: number | null): number | null {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return null;
}

function valueOf(item: SortableItem, key: SortKey): string | number | null {
  switch (key) {
    case "name":
      return item.name ?? "";
    case "type":
      // A folder has no resource_type; it sorts under its own word so a
      // type-sorted list does not put every folder under an empty heading.
      return item.kind === "folder" ? "folder" : item.type ?? "";
    case "size":
      return item.size ?? null;
    case "updated":
      return item.updated ? Date.parse(item.updated) : null;
  }
}

export function compareItems(a: SortableItem, b: SortableItem, sort: SortState | null): number {
  // Folders above files in every order, as both Drive and OneDrive do. It is
  // the one part of the ordering that a column click does not change.
  if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1;

  if (!sort) return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);

  const av = valueOf(a, sort.key);
  const bv = valueOf(b, sort.key);
  const flip = sort.dir === "asc" ? 1 : -1;

  if (typeof av === "number" || typeof bv === "number" || av === null || bv === null) {
    const nulls = compareNullable(av as number | null, bv as number | null);
    if (nulls !== null) return nulls;
    return ((av as number) - (bv as number)) * flip;
  }

  // localeCompare with numeric so "Week 2" comes before "Week 10", which is
  // the whole reason a natural sort is worth having on a file list.
  const byName = av.localeCompare(bv, "en-GB", { numeric: true, sensitivity: "base" });
  if (byName !== 0) return byName * flip;

  // A stable tiebreak, so two files of the same type keep a predictable order
  // rather than shuffling between renders.
  return a.name.localeCompare(b.name, "en-GB", { numeric: true, sensitivity: "base" });
}

export function sortItems<T extends SortableItem>(items: readonly T[], sort: SortState | null): T[] {
  return [...items].sort((a, b) => compareItems(a, b, sort));
}

/** What a heading announces to a screen reader. */
export function ariaSortFor(sort: SortState | null, key: SortKey): "ascending" | "descending" | "none" {
  if (!sort || sort.key !== key) return "none";
  return sort.dir === "asc" ? "ascending" : "descending";
}
