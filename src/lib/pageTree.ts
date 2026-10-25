/**
 * The pages layout's tree: each section is a page, and each folder marked as a
 * page is a subpage of the nearest page above it.
 *
 * "Nearest page above" rather than "parent folder" because a page can sit
 * inside a plain folder — Exam prep › Past papers › Part 2 (a page) — and it
 * still belongs to Exam prep in the tree; the plain folder in between is only
 * somewhere files are kept.
 */

interface SectionLike { id: string; name: string; sort_order: number | null }
interface FolderLike {
  id: string;
  name: string;
  subsection_id: string;
  parent_folder_id: string | null;
  sort_order: number | null;
  is_page?: boolean | null;
}
interface FileLike { subsection_id: string; folder_id?: string | null }

export interface PageNode {
  kind: "section" | "folder";
  /** The section's id, or the folder's. */
  id: string;
  subsectionId: string;
  name: string;
  depth: number;
  children: PageNode[];
}

const bySortOrder = <T extends { sort_order: number | null; name: string }>(a: T, b: T) =>
  (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name);

/**
 * The page a folder's contents are shown on: the folder itself if it is a
 * page, else the nearest page above it, else null for the section's own page.
 */
export function owningPageId<F extends FolderLike>(folders: readonly F[], folderId: string | null | undefined): string | null {
  const byId = new Map(folders.map((f) => [f.id, f]));
  let cursor = folderId ? byId.get(folderId) : undefined;
  let hops = 0;
  while (cursor && hops < 64) {
    if (cursor.is_page) return cursor.id;
    cursor = cursor.parent_folder_id ? byId.get(cursor.parent_folder_id) : undefined;
    hops += 1;
  }
  return null;
}

export function buildPageTree<S extends SectionLike, F extends FolderLike>(
  sections: readonly S[],
  folders: readonly F[],
): PageNode[] {
  const pages = folders.filter((f) => f.is_page);
  const byId = new Map(folders.map((f) => [f.id, f]));
  // A page's place in the tree: the nearest page strictly above it.
  const parentPage = (f: F) => owningPageId(folders, f.parent_folder_id ? byId.get(f.parent_folder_id)?.id : null);

  const childrenOf = (subsectionId: string, parentId: string | null, depth: number, seen: Set<string>): PageNode[] =>
    pages
      .filter((f) => f.subsection_id === subsectionId && parentPage(f) === parentId && !seen.has(f.id))
      .sort(bySortOrder)
      .map((f) => {
        const next = new Set(seen).add(f.id);
        return {
          kind: "folder" as const,
          id: f.id,
          subsectionId,
          name: f.name,
          depth,
          children: childrenOf(subsectionId, f.id, depth + 1, next),
        };
      });

  return [...sections].sort(bySortOrder).map((s) => ({
    kind: "section" as const,
    id: s.id,
    subsectionId: s.id,
    name: s.name,
    depth: 0,
    children: childrenOf(s.id, null, 1, new Set()),
  }));
}

/** Every node, parents before children, for the phone's page picker. */
export function flattenPageTree(tree: readonly PageNode[]): PageNode[] {
  return tree.flatMap((node) => [node, ...flattenPageTree(node.children)]);
}

/** The nodes from the top of the tree down to the one given, inclusive. */
export function pageTrail(tree: readonly PageNode[], id: string): PageNode[] {
  for (const node of tree) {
    if (node.id === id) return [node];
    const below = pageTrail(node.children, id);
    if (below.length) return [node, ...below];
  }
  return [];
}

/** How many files a page holds, counting plain folders inside it but not its subpages. */
export function filesOnPage<F extends FolderLike, R extends FileLike>(
  folders: readonly F[],
  files: readonly R[],
  page: Pick<PageNode, "kind" | "id" | "subsectionId">,
): number {
  const pageId = page.kind === "folder" ? page.id : null;
  return files.filter(
    (r) => r.subsection_id === page.subsectionId && owningPageId(folders, r.folder_id ?? null) === pageId,
  ).length;
}

/** The folders that are pages, so a page's file list can leave them out. */
export function pageFolderIds<F extends FolderLike>(folders: readonly F[]): Set<string> {
  return new Set(folders.filter((f) => f.is_page).map((f) => f.id));
}
