import { describe, expect, it } from "vitest";
import { buildPageTree, filesOnPage, flattenPageTree, owningPageId, pageTrail } from "./pageTree";

const sections = [
  { id: "exam", name: "Exam prep", sort_order: 1 },
  { id: "arcp", name: "ARCP", sort_order: 0 },
];
const folder = (id: string, parent: string | null, isPage: boolean, subsection = "arcp", sort = 0) => ({
  id, name: id, subsection_id: subsection, parent_folder_id: parent, sort_order: sort, is_page: isPage,
});
const folders = [
  folder("dates", null, true, "arcp", 1),
  folder("requirements", null, true, "arcp", 0),
  folder("evidence", "requirements", false),
  folder("examples", "evidence", true), // a page inside a plain folder inside a page
  folder("papers", null, false, "exam"),
  folder("part2", "papers", true, "exam"),
];

describe("owningPageId", () => {
  it("is the folder itself, the nearest page above, or the section", () => {
    expect(owningPageId(folders, "requirements")).toBe("requirements");
    expect(owningPageId(folders, "evidence")).toBe("requirements");
    expect(owningPageId(folders, "papers")).toBeNull();
    expect(owningPageId(folders, null)).toBeNull();
  });
});

describe("buildPageTree", () => {
  it("nests pages under the nearest page, in order, skipping plain folders", () => {
    const tree = buildPageTree(sections, folders);
    expect(tree.map((n) => n.id)).toEqual(["arcp", "exam"]);
    expect(tree[0].children.map((n) => n.id)).toEqual(["requirements", "dates"]);
    expect(tree[0].children[0].children.map((n) => n.id)).toEqual(["examples"]);
    expect(tree[0].children[0].children[0].depth).toBe(2);
    expect(tree[1].children.map((n) => n.id)).toEqual(["part2"]);
  });

  it("is just the sections when no folder is a page", () => {
    const tree = buildPageTree(sections, folders.map((f) => ({ ...f, is_page: false })));
    expect(tree.every((n) => n.children.length === 0)).toBe(true);
  });

  it("treats a missing is_page (old schema) as not a page", () => {
    const old = folders.map(({ is_page: _ignored, ...f }) => f);
    expect(buildPageTree(sections, old).every((n) => n.children.length === 0)).toBe(true);
  });
});

describe("flattenPageTree and pageTrail", () => {
  it("lists parents before children and finds the way down", () => {
    const tree = buildPageTree(sections, folders);
    expect(flattenPageTree(tree).map((n) => n.id)).toEqual(["arcp", "requirements", "examples", "dates", "exam", "part2"]);
    expect(pageTrail(tree, "examples").map((n) => n.id)).toEqual(["arcp", "requirements", "examples"]);
    expect(pageTrail(tree, "nope")).toEqual([]);
  });
});

describe("filesOnPage", () => {
  it("counts files in the page and its plain folders, not in its subpages", () => {
    const files = [
      { subsection_id: "arcp", folder_id: null },
      { subsection_id: "arcp", folder_id: "requirements" },
      { subsection_id: "arcp", folder_id: "evidence" },
      { subsection_id: "arcp", folder_id: "examples" },
    ];
    expect(filesOnPage(folders, files, { kind: "section", id: "arcp", subsectionId: "arcp" })).toBe(1);
    expect(filesOnPage(folders, files, { kind: "folder", id: "requirements", subsectionId: "arcp" })).toBe(2);
    expect(filesOnPage(folders, files, { kind: "folder", id: "examples", subsectionId: "arcp" })).toBe(1);
  });
});
