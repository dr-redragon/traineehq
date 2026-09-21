import { describe, it, expect } from "vitest";

import {
  ariaSortFor, compareItems, nextSort, sortItems, type SortableItem,
} from "./driveSort";

const folder = (name: string, sortOrder = 0): SortableItem =>
  ({ kind: "folder", name, sortOrder });

const file = (
  name: string,
  extra: Partial<SortableItem> = {},
): SortableItem => ({ kind: "file", name, sortOrder: 0, ...extra });

describe("nextSort", () => {
  it("starts a fresh column ascending", () => {
    expect(nextSort(null, "name")).toEqual({ key: "name", dir: "asc" });
  });

  it("goes ascending, descending, then back to hand-arranged order", () => {
    const asc = nextSort(null, "size");
    const desc = nextSort(asc, "size");
    expect(asc).toEqual({ key: "size", dir: "asc" });
    expect(desc).toEqual({ key: "size", dir: "desc" });
    expect(nextSort(desc, "size")).toBeNull();
  });

  it("starts a different column ascending rather than keeping the direction", () => {
    expect(nextSort({ key: "name", dir: "desc" }, "updated")).toEqual({ key: "updated", dir: "asc" });
  });
});

describe("folders and files", () => {
  it("keeps folders above files whichever way the column runs", () => {
    const items = [file("apple"), folder("zebra")];
    for (const sort of [null, { key: "name", dir: "asc" }, { key: "name", dir: "desc" }] as const) {
      expect(sortItems(items, sort).map((i) => i.name)[0]).toBe("zebra");
    }
  });
});

describe("with no sort", () => {
  it("falls back to the hand-arranged order that drag-and-drop writes", () => {
    const items = [file("c", { sortOrder: 2 }), file("a", { sortOrder: 0 }), file("b", { sortOrder: 1 })];
    expect(sortItems(items, null).map((i) => i.name)).toEqual(["a", "b", "c"]);
  });
});

describe("by name", () => {
  it("sorts naturally, so Week 2 comes before Week 10", () => {
    const items = [file("Week 10"), file("Week 2"), file("Week 1")];
    expect(sortItems(items, { key: "name", dir: "asc" }).map((i) => i.name))
      .toEqual(["Week 1", "Week 2", "Week 10"]);
  });

  it("ignores case, so a lowercase name is not exiled to the end", () => {
    const items = [file("beta"), file("Alpha"), file("gamma")];
    expect(sortItems(items, { key: "name", dir: "asc" }).map((i) => i.name))
      .toEqual(["Alpha", "beta", "gamma"]);
  });

  it("reverses on descending", () => {
    const items = [file("a"), file("b")];
    expect(sortItems(items, { key: "name", dir: "desc" }).map((i) => i.name)).toEqual(["b", "a"]);
  });
});

describe("by size", () => {
  it("orders smallest first ascending", () => {
    const items = [file("big", { size: 900 }), file("small", { size: 10 })];
    expect(sortItems(items, { key: "size", dir: "asc" }).map((i) => i.name)).toEqual(["small", "big"]);
  });

  it("puts a sizeless row last in both directions, rather than calling it zero", () => {
    const items = [file("link", { size: null }), file("small", { size: 10 }), file("big", { size: 900 })];
    expect(sortItems(items, { key: "size", dir: "asc" }).map((i) => i.name)).toEqual(["small", "big", "link"]);
    expect(sortItems(items, { key: "size", dir: "desc" }).map((i) => i.name)).toEqual(["big", "small", "link"]);
  });
});

describe("by updated", () => {
  it("orders oldest first ascending and newest first descending", () => {
    const items = [
      file("new", { updated: "2026-09-20T00:00:00Z" }),
      file("old", { updated: "2020-01-01T00:00:00Z" }),
    ];
    expect(sortItems(items, { key: "updated", dir: "asc" }).map((i) => i.name)).toEqual(["old", "new"]);
    expect(sortItems(items, { key: "updated", dir: "desc" }).map((i) => i.name)).toEqual(["new", "old"]);
  });

  it("puts a row with no date last", () => {
    const items = [file("undated", { updated: null }), file("dated", { updated: "2026-01-01T00:00:00Z" })];
    expect(sortItems(items, { key: "updated", dir: "asc" }).map((i) => i.name)).toEqual(["dated", "undated"]);
  });
});

describe("by type", () => {
  it("groups files by their kind", () => {
    const items = [file("b", { type: "video" }), file("a", { type: "pdf" })];
    expect(sortItems(items, { key: "type", dir: "asc" }).map((i) => i.name)).toEqual(["a", "b"]);
  });

  it("breaks a tie on name, so equal types do not shuffle", () => {
    const items = [file("z", { type: "pdf" }), file("a", { type: "pdf" })];
    expect(sortItems(items, { key: "type", dir: "asc" }).map((i) => i.name)).toEqual(["a", "z"]);
    // Same tiebreak descending: the type comparison is equal, so name still leads.
    expect(sortItems(items, { key: "type", dir: "desc" }).map((i) => i.name)).toEqual(["a", "z"]);
  });
});

describe("sortItems", () => {
  it("does not mutate what it was given", () => {
    const items = [file("b"), file("a")];
    const copy = [...items];
    sortItems(items, { key: "name", dir: "asc" });
    expect(items).toEqual(copy);
  });
});

describe("ariaSortFor", () => {
  it("only marks the column actually being sorted", () => {
    const sort = { key: "name", dir: "asc" } as const;
    expect(ariaSortFor(sort, "name")).toBe("ascending");
    expect(ariaSortFor(sort, "size")).toBe("none");
    expect(ariaSortFor({ key: "name", dir: "desc" }, "name")).toBe("descending");
    expect(ariaSortFor(null, "name")).toBe("none");
  });
});

describe("compareItems directly", () => {
  it("is symmetric, so the sort is well defined", () => {
    const a = file("a", { size: 1 });
    const b = file("b", { size: 2 });
    const sort = { key: "size", dir: "asc" } as const;
    expect(Math.sign(compareItems(a, b, sort))).toBe(-Math.sign(compareItems(b, a, sort)));
  });
});
