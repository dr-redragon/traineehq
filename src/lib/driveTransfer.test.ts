import { describe, expect, it } from "vitest";

import {
  branchTopDown, copiedStoragePath, copyName, looseFiles, topLevelFolders,
} from "./driveTransfer";

const folders = [
  { id: "a", name: "A", parent_folder_id: null },
  { id: "a1", name: "A1", parent_folder_id: "a" },
  { id: "a1x", name: "A1x", parent_folder_id: "a1" },
  { id: "b", name: "B", parent_folder_id: null },
];

describe("topLevelFolders", () => {
  it("drops folders whose ancestor is also selected", () => {
    expect(topLevelFolders(folders, ["a1x", "a", "b"])).toEqual(["a", "b"]);
  });

  it("keeps a subfolder selected on its own", () => {
    expect(topLevelFolders(folders, ["a1"])).toEqual(["a1"]);
  });
});

describe("looseFiles", () => {
  const files = [
    { id: "f-root", folder_id: null },
    { id: "f-deep", folder_id: "a1x" },
    { id: "f-b", folder_id: "b" },
  ];

  it("leaves out files that travel inside a selected folder", () => {
    expect(looseFiles(files, folders, ["f-root", "f-deep", "f-b"], ["a"])).toEqual(["f-root", "f-b"]);
  });
});

describe("branchTopDown", () => {
  it("lists every parent before its children", () => {
    const order = branchTopDown(folders, "a");
    expect(order).toEqual(["a", "a1", "a1x"]);
  });
});

describe("copyName", () => {
  it("keeps a name that is free", () => {
    expect(copyName("Notes", ["Other"])).toBe("Notes");
  });

  it("numbers copies past the first", () => {
    expect(copyName("Notes", ["Notes"])).toBe("Notes (copy)");
    expect(copyName("Notes", ["Notes", "Notes (copy)"])).toBe("Notes (copy 2)");
  });
});

describe("copiedStoragePath", () => {
  it("keeps the extension and files it under the destination category", () => {
    expect(copiedStoragePath("spec/sub-1/old.pdf", "spec", "sub-2", "new")).toBe("spec/sub-2/new.pdf");
  });

  it("copes with a path that has no extension", () => {
    expect(copiedStoragePath("spec/sub-1/old", "spec", "sub-2", "new")).toBe("spec/sub-2/new");
  });
});
