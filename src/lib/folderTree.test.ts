import { describe, it, expect } from "vitest";

import {
  canMoveFolder, childFiles, childFolders, collapseWithDescendants, descendantFolderIds,
  expandToFolder, flattenDrive, folderCounts, folderPath, validMoveTargets,
  type FileLike, type FolderLike,
} from "./folderTree";

/**
 *   Curriculum            (root)
 *     └ Year 1
 *         └ Term 1        — holds exam.pdf
 *     └ Year 2            — empty
 *   Guidelines            (root, holds ent.pdf)
 *   loose.pdf             (no folder)
 */
const folders: FolderLike[] = [
  { id: "curriculum", name: "Curriculum", parent_folder_id: null, sort_order: 0 },
  { id: "year1", name: "Year 1", parent_folder_id: "curriculum", sort_order: 0 },
  { id: "term1", name: "Term 1", parent_folder_id: "year1", sort_order: 0 },
  { id: "year2", name: "Year 2", parent_folder_id: "curriculum", sort_order: 1 },
  { id: "guidelines", name: "Guidelines", parent_folder_id: null, sort_order: 1 },
];

const files: FileLike[] = [
  { id: "exam.pdf", folder_id: "term1" },
  { id: "ent.pdf", folder_id: "guidelines" },
  { id: "loose.pdf", folder_id: null },
];

describe("children", () => {
  it("treats a missing parent as the root, not as a separate place", () => {
    const withUndefined: FolderLike[] = [{ id: "x", name: "X" }];
    expect(childFolders(withUndefined, null).map((f) => f.id)).toEqual(["x"]);
  });

  it("lists only direct children, not the whole branch", () => {
    expect(childFolders(folders, "curriculum").map((f) => f.id)).toEqual(["year1", "year2"]);
    expect(childFiles(files, "term1").map((f) => f.id)).toEqual(["exam.pdf"]);
  });
});

describe("folderPath", () => {
  it("reads outermost first, so it can be drawn as a breadcrumb", () => {
    expect(folderPath(folders, "term1").map((f) => f.name)).toEqual(["Curriculum", "Year 1", "Term 1"]);
  });

  it("is empty at the section root", () => {
    expect(folderPath(folders, null)).toEqual([]);
  });

  it("stops rather than hanging if the rows point at each other", () => {
    const looped: FolderLike[] = [
      { id: "a", name: "A", parent_folder_id: "b" },
      { id: "b", name: "B", parent_folder_id: "a" },
    ];
    expect(folderPath(looped, "a").length).toBeLessThanOrEqual(2);
  });

  it("stops at a parent that no longer exists", () => {
    const orphan: FolderLike[] = [{ id: "a", name: "A", parent_folder_id: "gone" }];
    expect(folderPath(orphan, "a").map((f) => f.id)).toEqual(["a"]);
  });
});

describe("descendantFolderIds", () => {
  it("reaches every level, not just the first", () => {
    expect(descendantFolderIds(folders, "curriculum")).toEqual(new Set(["year1", "term1", "year2"]));
  });

  it("excludes the folder itself", () => {
    expect(descendantFolderIds(folders, "curriculum").has("curriculum")).toBe(false);
  });

  it("is empty for a leaf", () => {
    expect(descendantFolderIds(folders, "term1").size).toBe(0);
  });
});

describe("canMoveFolder", () => {
  it("allows a move to the section root", () => {
    expect(canMoveFolder(folders, "term1", null)).toBe(true);
  });

  it("allows a move sideways into an unrelated folder", () => {
    expect(canMoveFolder(folders, "term1", "guidelines")).toBe(true);
  });

  it("refuses a folder into itself", () => {
    expect(canMoveFolder(folders, "curriculum", "curriculum")).toBe(false);
  });

  it("refuses a folder into its own child", () => {
    expect(canMoveFolder(folders, "curriculum", "year1")).toBe(false);
  });

  it("refuses a folder into a grandchild — the case a one-level check misses", () => {
    expect(canMoveFolder(folders, "curriculum", "term1")).toBe(false);
  });

  it("allows moving a child up under its own grandparent", () => {
    expect(canMoveFolder(folders, "term1", "curriculum")).toBe(true);
  });
});

describe("validMoveTargets", () => {
  it("offers everywhere legal and nothing else", () => {
    expect(validMoveTargets(folders, "curriculum").map((f) => f.id)).toEqual(["guidelines"]);
    expect(validMoveTargets(folders, "term1").map((f) => f.id).sort())
      .toEqual(["curriculum", "guidelines", "year1", "year2"]);
  });
});

describe("folderCounts", () => {
  it("separates what is directly inside from what is anywhere below", () => {
    expect(folderCounts(folders, files, "curriculum")).toEqual({ direct: 0, total: 1 });
    expect(folderCounts(folders, files, "term1")).toEqual({ direct: 1, total: 1 });
    expect(folderCounts(folders, files, "guidelines")).toEqual({ direct: 1, total: 1 });
    expect(folderCounts(folders, files, "year2")).toEqual({ direct: 0, total: 0 });
  });
});

describe("flattenDrive", () => {
  const ids = (rows: ReturnType<typeof flattenDrive>) => rows.map((r) => `${" ".repeat(r.depth)}${r.id}`);

  it("shows only the top level when nothing is expanded", () => {
    const rows = flattenDrive({ folders, files, expanded: new Set() });
    expect(ids(rows)).toEqual(["curriculum", "guidelines", "loose.pdf"]);
  });

  it("puts folders above files at the root", () => {
    const rows = flattenDrive({ folders, files, expanded: new Set() });
    expect(rows[rows.length - 1].kind).toBe("file");
  });

  it("opens a folder in place, indented, rather than replacing the view", () => {
    const rows = flattenDrive({ folders, files, expanded: new Set(["curriculum"]) });
    expect(ids(rows)).toEqual(["curriculum", " year1", " year2", "guidelines", "loose.pdf"]);
  });

  it("nests further as deeper folders are opened", () => {
    const rows = flattenDrive({ folders, files, expanded: new Set(["curriculum", "year1", "term1"]) });
    expect(ids(rows)).toEqual([
      "curriculum", " year1", "  term1", "   exam.pdf", " year2", "guidelines", "loose.pdf",
    ]);
  });

  it("marks which folders have anything to reveal", () => {
    const rows = flattenDrive({ folders, files, expanded: new Set(["curriculum"]) });
    const byId = Object.fromEntries(rows.filter((r) => r.kind === "folder").map((r) => [r.id, r.hasChildren]));
    expect(byId).toEqual({ curriculum: true, year1: true, year2: false, guidelines: true });
  });

  it("scopes to an opened folder when given a root, which is the drill-in view", () => {
    const rows = flattenDrive({ folders, files, rootId: "curriculum", expanded: new Set() });
    expect(ids(rows)).toEqual(["year1", "year2"]);
  });

  it("applies the caller's ordering at every level", () => {
    const reverse = <T extends { name?: string }>(rows: T[]) => [...rows].reverse();
    const rows = flattenDrive({
      folders, files, expanded: new Set(["curriculum"]), sortFolders: reverse,
    });
    expect(ids(rows)).toEqual(["guidelines", "curriculum", " year2", " year1", "loose.pdf"]);
  });

  it("terminates on cyclic data instead of recursing forever", () => {
    const looped: FolderLike[] = [
      { id: "a", name: "A", parent_folder_id: null },
      { id: "b", name: "B", parent_folder_id: "a" },
      { id: "a2", name: "A2", parent_folder_id: "b" },
    ];
    // Force the loop: a2's child is a, which is already on the path.
    const cyclic = looped.map((f) => (f.id === "a" ? { ...f, parent_folder_id: "a2" } : f));
    const rows = flattenDrive({ folders: cyclic, files: [], expanded: new Set(["a", "b", "a2"]) });
    expect(rows.length).toBeLessThan(20);
  });
});

describe("expanding and collapsing", () => {
  it("collapsing a branch also collapses everything under it", () => {
    const open = new Set(["curriculum", "year1", "term1", "guidelines"]);
    expect(collapseWithDescendants(folders, open, "curriculum")).toEqual(new Set(["guidelines"]));
  });

  it("expanding to a deep folder reveals its ancestors too", () => {
    expect(expandToFolder(folders, new Set(), "term1")).toEqual(new Set(["curriculum", "year1", "term1"]));
  });

  it("does not mutate the set it was given", () => {
    const open = new Set(["curriculum"]);
    collapseWithDescendants(folders, open, "curriculum");
    expandToFolder(folders, open, "term1");
    expect(open).toEqual(new Set(["curriculum"]));
  });
});
