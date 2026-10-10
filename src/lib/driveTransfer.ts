/**
 * Moving things between categories, and copying them.
 *
 * Inside one category a move is a single column — `folder_id` for a file,
 * `parent_folder_id` for a folder. Across categories it is a whole branch: the
 * folder, every folder under it and every file under those all change
 * `subsection_id` together, and the database refuses a child folder whose
 * category disagrees with its parent's. So the writes have to go parents
 * first, and that ordering is the part worth keeping out of the component.
 *
 * Copying is the same walk with inserts instead of updates, plus new names
 * where the copy would otherwise sit beside an identical one.
 */

import { descendantFolderIds, type FolderLike } from "@/lib/folderTree";

/**
 * The top of each branch being carried.
 *
 * A selection can hold a folder *and* something inside it — select-all with a
 * folder expanded does exactly that. The inner one travels with its parent
 * anyway, and moving it on its own as well would pull it back out of the
 * branch it is supposed to stay in.
 */
export function topLevelFolders<F extends FolderLike>(folders: readonly F[], ids: readonly string[]): string[] {
  const chosen = new Set(ids);
  const byId = new Map(folders.map((f) => [f.id, f]));
  return ids.filter((id) => {
    let cursor = byId.get(id)?.parent_folder_id ?? null;
    const seen = new Set<string>();
    while (cursor && !seen.has(cursor)) {
      if (chosen.has(cursor)) return false;
      seen.add(cursor);
      cursor = byId.get(cursor)?.parent_folder_id ?? null;
    }
    return true;
  });
}

/** Files carried along by their folder, which therefore must not move on their own. */
export function looseFiles<R extends { id: string; folder_id?: string | null }, F extends FolderLike>(
  files: readonly R[],
  folders: readonly F[],
  fileIds: readonly string[],
  folderIds: readonly string[],
): string[] {
  const covered = new Set<string>();
  for (const id of folderIds) {
    covered.add(id);
    descendantFolderIds(folders, id).forEach((d) => covered.add(d));
  }
  return fileIds.filter((id) => {
    const file = files.find((f) => f.id === id);
    return !file || !covered.has(file.folder_id ?? "");
  });
}

/**
 * A folder and everything under it, parents before children.
 *
 * That order is what lets each row be written on its own: by the time a
 * subfolder changes category, the folder it sits in already has.
 */
export function branchTopDown<F extends FolderLike>(folders: readonly F[], rootId: string): string[] {
  // `descendantFolderIds` walks breadth-first, so its order is already one
  // level at a time — every parent is reached before any of its children.
  return [rootId, ...descendantFolderIds(folders, rootId)];
}

/**
 * The name a copy takes so it does not sit beside an identical one.
 *
 * "Notes" becomes "Notes (copy)", then "Notes (copy 2)" and so on. A name that
 * is free where the copy is going is kept as it is — copying into a different
 * folder or category is not a reason to rename anything.
 */
export function copyName(name: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  if (!used.has(name)) return name;
  let candidate = `${name} (copy)`;
  let n = 2;
  while (used.has(candidate)) candidate = `${name} (copy ${n++})`;
  return candidate;
}

/** A fresh storage path for a copied upload, in the destination category's folder. */
export function copiedStoragePath(sourcePath: string, specialtyId: string, subsectionId: string, id: string): string {
  const file = sourcePath.split("/").pop() ?? "";
  const dot = file.lastIndexOf(".");
  const ext = dot > 0 ? file.slice(dot) : "";
  return `${specialtyId}/${subsectionId}/${id}${ext}`;
}
