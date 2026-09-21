/**
 * The nested folder model behind the file browser.
 *
 * Folders used to be one level deep: a folder belonged to a section and that
 * was the end of it. They now hang off each other through `parent_folder_id`,
 * which means every question the browser asks stops being a filter and starts
 * being a walk — what is the path to here, what is inside here, and which
 * moves would tie the tree in a knot.
 *
 * All of it is pure and takes plain rows, because a tree is the kind of thing
 * that looks obviously right and is quietly wrong on the third level down.
 */

export interface FolderLike {
  id: string;
  name: string;
  parent_folder_id?: string | null;
  sort_order?: number | null;
}

export interface FileLike {
  id: string;
  folder_id?: string | null;
}

/** Depth 0 is whatever the browser is currently showing as its root. */
export interface DriveRowItem<F extends FolderLike, R extends FileLike> {
  kind: "folder" | "file";
  id: string;
  depth: number;
  folder?: F;
  file?: R;
  /** Folders only: whether there is anything inside to reveal. */
  hasChildren?: boolean;
  expanded?: boolean;
}

/** Children of one folder — or of the section itself, when `parentId` is null. */
export function childFolders<F extends FolderLike>(folders: readonly F[], parentId: string | null): F[] {
  return folders.filter((f) => (f.parent_folder_id ?? null) === parentId);
}

export function childFiles<R extends FileLike>(files: readonly R[], parentId: string | null): R[] {
  return files.filter((r) => (r.folder_id ?? null) === parentId);
}

/**
 * The trail from the section root down to a folder, outermost first.
 *
 * Guarded against a cycle rather than trusting the data: if rows ever did
 * point at each other, a breadcrumb would be the first thing to hang, and it
 * would hang the whole page with it.
 */
export function folderPath<F extends FolderLike>(folders: readonly F[], id: string | null): F[] {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const trail: F[] = [];
  const seen = new Set<string>();
  let cursor = id;
  while (cursor) {
    if (seen.has(cursor)) break;
    seen.add(cursor);
    const folder = byId.get(cursor);
    if (!folder) break;
    trail.unshift(folder);
    cursor = folder.parent_folder_id ?? null;
  }
  return trail;
}

/** Every folder beneath this one, at any depth. Excludes the folder itself. */
export function descendantFolderIds<F extends FolderLike>(folders: readonly F[], id: string): Set<string> {
  const out = new Set<string>();
  const queue = [id];
  while (queue.length) {
    const current = queue.shift()!;
    for (const child of folders) {
      const parent = child.parent_folder_id ?? null;
      if (parent === current && !out.has(child.id)) {
        out.add(child.id);
        queue.push(child.id);
      }
    }
  }
  return out;
}

/**
 * Whether a folder may be moved under a given parent.
 *
 * The two refusals are the same mistake seen from different angles: dropping a
 * folder onto itself, and dropping it into something it contains. Either one
 * detaches that whole branch from the root — the rows survive, but nothing can
 * reach them again, and a breadcrumb walking up from inside never terminates.
 */
export function canMoveFolder<F extends FolderLike>(
  folders: readonly F[],
  movingId: string,
  targetParentId: string | null,
): boolean {
  if (targetParentId === null) return true;
  if (movingId === targetParentId) return false;
  return !descendantFolderIds(folders, movingId).has(targetParentId);
}

/** Every folder a given folder is allowed to move into, for a move dialog. */
export function validMoveTargets<F extends FolderLike>(folders: readonly F[], movingId: string): F[] {
  return folders.filter((f) => f.id !== movingId && canMoveFolder(folders, movingId, f.id));
}

/** How many files sit directly in a folder, plus how many sit anywhere below it. */
export function folderCounts<F extends FolderLike, R extends FileLike>(
  folders: readonly F[],
  files: readonly R[],
  id: string,
): { direct: number; total: number } {
  const below = descendantFolderIds(folders, id);
  let direct = 0;
  let total = 0;
  for (const file of files) {
    const parent = file.folder_id ?? null;
    if (parent === id) { direct += 1; total += 1; } else if (parent && below.has(parent)) { total += 1; }
  }
  return { direct, total };
}

/**
 * The rows to draw, in order, with the indentation each one needs.
 *
 * This is what makes a folder open *in place*: an expanded folder is followed
 * immediately by its own contents one level deeper, rather than replacing the
 * view. A folder that is not expanded contributes one row and nothing else, so
 * a deep tree costs nothing until someone opens it.
 *
 * Folders come before files at every level, which is what both Drive and
 * OneDrive do, and the caller supplies the ordering within each group so the
 * column sort applies the whole way down.
 */
export function flattenDrive<F extends FolderLike, R extends FileLike>({
  folders, files, rootId = null, expanded, sortFolders = (f) => f, sortFiles = (r) => r, maxDepth = 24,
}: {
  folders: readonly F[];
  files: readonly R[];
  rootId?: string | null;
  expanded: ReadonlySet<string>;
  sortFolders?: (rows: F[]) => F[];
  sortFiles?: (rows: R[]) => R[];
  /** A backstop against a cycle that reached the client anyway. */
  maxDepth?: number;
}): DriveRowItem<F, R>[] {
  const out: DriveRowItem<F, R>[] = [];
  const guard = new Set<string>();

  const walk = (parentId: string | null, depth: number) => {
    if (depth > maxDepth) return;
    for (const folder of sortFolders(childFolders(folders, parentId))) {
      if (guard.has(folder.id)) continue;
      guard.add(folder.id);
      const hasChildren =
        childFolders(folders, folder.id).length > 0 || childFiles(files, folder.id).length > 0;
      const isOpen = expanded.has(folder.id);
      out.push({ kind: "folder", id: folder.id, depth, folder, hasChildren, expanded: isOpen });
      if (isOpen) walk(folder.id, depth + 1);
    }
    for (const file of sortFiles(childFiles(files, parentId))) {
      out.push({ kind: "file", id: file.id, depth, file });
    }
  };

  walk(rootId, 0);
  return out;
}

/**
 * Collapse a folder and everything under it.
 *
 * Leaving descendants expanded looks harmless — they are not on screen — until
 * the parent is opened again and a branch someone closed long ago unfolds with
 * it.
 */
export function collapseWithDescendants<F extends FolderLike>(
  folders: readonly F[],
  expanded: ReadonlySet<string>,
  id: string,
): Set<string> {
  const next = new Set(expanded);
  next.delete(id);
  for (const child of descendantFolderIds(folders, id)) next.delete(child);
  return next;
}

/** Expanding a folder has to reveal its ancestors too, or it stays hidden. */
export function expandToFolder<F extends FolderLike>(
  folders: readonly F[],
  expanded: ReadonlySet<string>,
  id: string,
): Set<string> {
  const next = new Set(expanded);
  for (const ancestor of folderPath(folders, id)) next.add(ancestor.id);
  return next;
}
