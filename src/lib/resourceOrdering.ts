/**
 * Working out what a drag-and-drop reorder should write.
 *
 * Kept apart from the browser component so it can be tested: the ordering rules
 * are the part that is easy to get subtly wrong, and the part whose breakage is
 * invisible until somebody's carefully arranged reading list comes back shuffled.
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
 * The writes needed to drop `draggingIds` onto the row `overId`.
 *
 * The row landed on names the destination list, so dragging a file from one
 * subheading onto a row under another moves it there *and* places it — which is
 * what dropping it on that spot rather than on the group as a whole looks like
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
): ReorderWrite[] {
  const over = all.find((r) => r.id === overId);
  if (!over) return [];

  const dragging = draggingIds
    .map((id) => all.find((r) => r.id === id))
    .filter((r): r is OrderableResource => !!r);
  if (!dragging.length) return [];

  // Dropping a selection onto one of its own members has no defined position.
  const draggingSet = new Set(dragging.map((r) => r.id));
  if (draggingSet.has(overId)) return [];

  const target = listOf(over);

  const siblings = all
    .filter((r) => {
      const list = listOf(r);
      return list.folderId === target.folderId && list.subheading === target.subheading;
    })
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

  // Where the dragged rows land relative to the row they were dropped on:
  // after it when they came from above it, before it when they came from below
  // or from another list. For a single row that is exactly dnd-kit's arrayMove,
  // which matters because arrayMove is what the drag preview animates — if this
  // disagreed, a row would settle one place from where the user watched it go.
  const overIndex = siblings.findIndex((r) => r.id === overId);
  const draggedIndices = dragging
    .map((r) => siblings.findIndex((s) => s.id === r.id))
    .filter((i) => i >= 0);
  const fromAbove = draggedIndices.length > 0 && Math.min(...draggedIndices) < overIndex;

  const remaining = siblings.filter((r) => !draggingSet.has(r.id));
  const at = remaining.findIndex((r) => r.id === overId);
  const index = at === -1 ? remaining.length : at + (fromAbove ? 1 : 0);
  const next = [...remaining.slice(0, index), ...dragging, ...remaining.slice(index)];

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
