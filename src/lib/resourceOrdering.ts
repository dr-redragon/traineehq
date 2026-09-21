import { insertItems } from "@/lib/dnd";

/**
 * Working out what a drag-and-drop reorder should write.
 *
 * Kept apart from the browser component so it can be tested: the ordering rules
 * are the part that is easy to get subtly wrong, and the part whose breakage is
 * invisible until somebody's carefully arranged reading list comes back
 * shuffled.
 *
 * A drop is expressed as a *gap* — the row it was let go over, and which side
 * of that row — because that is exactly what the drop indicator draws. The
 * previous version was given only the row and guessed the side from where the
 * dragged item had come, which is a guess that can disagree with the line the
 * user was looking at. Now it cannot: the line and the write come from the
 * same two values.
 */

export interface OrderableResource {
  id: string;
  folder_id: string | null;
  subheading: string | null;
  sort_order: number | null;
}

export interface ReorderWrite {
  id: string;
  folder_id: string | null;
  subheading: string | null;
  sort_order: number;
}

const listOf = (r: OrderableResource) => ({
  folderId: r.folder_id ?? null,
  subheading: r.subheading ?? null,
});

/**
 * The writes needed to drop `draggingIds` into the gap beside the row `overId`.
 *
 * The row landed beside names the destination list, so dragging a file from one
 * subheading to a gap under another moves it there *and* places it — which is
 * what dropping it in that gap rather than on the group as a whole looks like
 * it should do.
 *
 * Returns only rows whose folder, subheading or position actually changes, so a
 * drop that settles everything back where it was writes nothing at all. An
 * empty array means there is nothing sensible to do — including the cases where
 * the target is unknown, or is itself one of the rows being dragged.
 */
export function planReorder(
  all: OrderableResource[],
  draggingIds: string[],
  overId: string,
  edge: "before" | "after" = "before",
): ReorderWrite[] {
  const over = all.find((r) => r.id === overId);
  if (!over) return [];

  const dragging = draggingIds
    .map((id) => all.find((r) => r.id === id))
    .filter((r): r is OrderableResource => !!r);
  if (!dragging.length) return [];

  // Dropping a selection beside one of its own members has no defined position.
  const draggingSet = new Set(dragging.map((r) => r.id));
  if (draggingSet.has(overId)) return [];

  const target = listOf(over);

  const siblings = all
    .filter((r) => {
      const list = listOf(r);
      return list.folderId === target.folderId && list.subheading === target.subheading;
    })
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

  const overIndex = siblings.findIndex((r) => r.id === overId);
  const slot = edge === "after" ? overIndex + 1 : overIndex;

  const next = insertItems(siblings, dragging, slot, (r) => r.id);

  const writes: ReorderWrite[] = [];
  next.forEach((r, i) => {
    const list = listOf(r);
    const settled =
      list.folderId === target.folderId &&
      list.subheading === target.subheading &&
      (r.sort_order ?? 0) === i;
    if (settled) return;
    writes.push({
      id: r.id,
      folder_id: target.folderId,
      subheading: target.subheading,
      sort_order: i,
    });
  });
  return writes;
}

export interface OrderableFolder {
  id: string;
  parent_folder_id: string | null;
  sort_order: number | null;
}

export interface FolderReorderWrite {
  id: string;
  parent_folder_id: string | null;
  sort_order: number;
}

/**
 * The same, for folders.
 *
 * Folders could not be rearranged at all before: every drop on a folder meant
 * "put this inside you", so there was no gesture left over for "put this
 * above you". Now that a folder row has edges as well as a middle, its
 * siblings can be ordered like anything else — and a folder dragged to an edge
 * in another branch joins that branch at that position, which is the same rule
 * files already followed.
 *
 * Cycles are the caller's to refuse before offering a target; this only orders.
 */
export function planFolderReorder(
  all: OrderableFolder[],
  draggingIds: string[],
  overId: string,
  edge: "before" | "after" = "before",
): FolderReorderWrite[] {
  const over = all.find((f) => f.id === overId);
  if (!over) return [];

  const draggingSet = new Set(draggingIds);
  if (draggingSet.has(overId)) return [];

  const dragging = draggingIds
    .map((id) => all.find((f) => f.id === id))
    .filter((f): f is OrderableFolder => !!f);
  if (!dragging.length) return [];

  const parent = over.parent_folder_id ?? null;
  const siblings = all
    .filter((f) => (f.parent_folder_id ?? null) === parent)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

  const overIndex = siblings.findIndex((f) => f.id === overId);
  const slot = edge === "after" ? overIndex + 1 : overIndex;
  const next = insertItems(siblings, dragging, slot, (f) => f.id);

  const writes: FolderReorderWrite[] = [];
  next.forEach((f, i) => {
    if ((f.parent_folder_id ?? null) === parent && (f.sort_order ?? 0) === i) return;
    writes.push({ id: f.id, parent_folder_id: parent, sort_order: i });
  });
  return writes;
}
