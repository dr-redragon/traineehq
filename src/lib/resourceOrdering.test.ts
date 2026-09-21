import { describe, it, expect } from "vitest";
import { planFolderReorder, planReorder, type OrderableFolder, type OrderableResource } from "./resourceOrdering";

/** Four files in one ungrouped list, in order. */
const flat = (): OrderableResource[] => [
  { id: "a", folder_id: null, subheading: null, sort_order: 0 },
  { id: "b", folder_id: null, subheading: null, sort_order: 1 },
  { id: "c", folder_id: null, subheading: null, sort_order: 2 },
  { id: "d", folder_id: null, subheading: null, sort_order: 3 },
];

/** The order the list ends up in, once the writes are applied. */
function resulting(all: OrderableResource[], writes: ReturnType<typeof planReorder>) {
  const byId = new Map(all.map((r) => [r.id, { ...r }]));
  for (const w of writes) {
    const row = byId.get(w.id);
    if (!row) continue;
    row.folder_id = w.folder_id;
    row.subheading = w.subheading;
    row.sort_order = w.sort_order;
  }
  return [...byId.values()]
    .sort((x, y) => (x.sort_order ?? 0) - (y.sort_order ?? 0))
    .map((r) => r.id);
}

describe("planReorder", () => {
  it("moves a row down to the gap it was dropped in", () => {
    const all = flat();
    const writes = planReorder(all, ["a"], "c", "after");
    expect(resulting(all, writes)).toEqual(["b", "c", "a", "d"]);
  });

  it("moves a row up to the gap it was dropped in", () => {
    const all = flat();
    const writes = planReorder(all, ["d"], "b", "before");
    expect(resulting(all, writes)).toEqual(["a", "d", "b", "c"]);
  });

  it("writes only the rows that actually shift", () => {
    const all = flat();
    // a and b swap; c and d never move, so they must not be written.
    const writes = planReorder(all, ["b"], "a", "before");
    expect(resulting(all, writes)).toEqual(["b", "a", "c", "d"]);
    expect(writes.map((w) => w.id).sort()).toEqual(["a", "b"]);
  });

  it("keeps a multi-row selection in its own relative order", () => {
    const all = flat();
    const writes = planReorder(all, ["a", "b"], "d", "after");
    expect(resulting(all, writes)).toEqual(["c", "d", "a", "b"]);
  });

  // The rule the whole thing turns on, stated on its own so it cannot drift:
  // the side of the row that was dropped on is the side the rows land on, and
  // nothing else is consulted. That is the line the indicator draws, which is
  // why what you are shown and what is written cannot disagree.
  it("lands on the side of the target it was dropped on, whichever way it came", () => {
    expect(resulting(flat(), planReorder(flat(), ["a"], "c", "after"))).toEqual(["b", "c", "a", "d"]);
    expect(resulting(flat(), planReorder(flat(), ["a"], "c", "before"))).toEqual(["b", "a", "c", "d"]);
    expect(resulting(flat(), planReorder(flat(), ["d"], "a", "before"))).toEqual(["d", "a", "b", "c"]);
    expect(resulting(flat(), planReorder(flat(), ["d"], "a", "after"))).toEqual(["a", "d", "b", "c"]);
  });

  it("writes nothing when the gap is where the row already was", () => {
    expect(planReorder(flat(), ["b"], "a", "after")).toEqual([]);
    expect(planReorder(flat(), ["b"], "c", "before")).toEqual([]);
  });

  it("carries a row into the list it was dropped into", () => {
    const all: OrderableResource[] = [
      { id: "x", folder_id: null, subheading: "Exams", sort_order: 0 },
      { id: "p", folder_id: null, subheading: "Guidelines", sort_order: 0 },
      { id: "q", folder_id: null, subheading: "Guidelines", sort_order: 1 },
    ];
    const writes = planReorder(all, ["x"], "q", "before");
    const moved = writes.find((w) => w.id === "x");
    expect(moved).toMatchObject({ subheading: "Guidelines", folder_id: null, sort_order: 1 });
    expect(resulting(all, writes).slice(0, 3)).toEqual(["p", "x", "q"]);
  });

  it("carries a row into a folder when dropped on a row inside one", () => {
    const all: OrderableResource[] = [
      { id: "loose", folder_id: null, subheading: null, sort_order: 0 },
      { id: "inside", folder_id: "f1", subheading: null, sort_order: 0 },
    ];
    const writes = planReorder(all, ["loose"], "inside", "before");
    expect(writes.find((w) => w.id === "loose")).toMatchObject({ folder_id: "f1", sort_order: 0 });
  });

  it("does nothing when the target is part of the dragged selection", () => {
    const all = flat();
    expect(planReorder(all, ["a", "b"], "b", "after")).toEqual([]);
  });

  it("does nothing when the target row is unknown", () => {
    expect(planReorder(flat(), ["a"], "missing", "before")).toEqual([]);
  });

  it("does nothing when nothing recognisable is being dragged", () => {
    expect(planReorder(flat(), ["ghost"], "c", "before")).toEqual([]);
  });

  it("normalises a list whose sort_order values are absent or duplicated", () => {
    const all: OrderableResource[] = [
      { id: "a", folder_id: null, subheading: null, sort_order: null },
      { id: "b", folder_id: null, subheading: null, sort_order: null },
      { id: "c", folder_id: null, subheading: null, sort_order: 5 },
    ];
    const writes = planReorder(all, ["c"], "a", "before");
    expect(resulting(all, writes)).toEqual(["c", "a", "b"]);
    expect(writes.map((w) => w.sort_order)).toEqual([0, 1, 2]);
  });
});

describe("planFolderReorder", () => {
  const tree = (): OrderableFolder[] => [
    { id: "f1", parent_folder_id: null, sort_order: 0 },
    { id: "f2", parent_folder_id: null, sort_order: 1 },
    { id: "f3", parent_folder_id: null, sort_order: 2 },
    { id: "deep", parent_folder_id: "f1", sort_order: 0 },
  ];

  const order = (all: OrderableFolder[], writes: ReturnType<typeof planFolderReorder>) => {
    const byId = new Map(all.map((f) => [f.id, { ...f }]));
    for (const w of writes) {
      const row = byId.get(w.id);
      if (!row) continue;
      row.parent_folder_id = w.parent_folder_id;
      row.sort_order = w.sort_order;
    }
    return [...byId.values()]
      .filter((f) => f.parent_folder_id === null)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .map((f) => f.id);
  };

  it("orders a folder among its siblings", () => {
    const all = tree();
    expect(order(all, planFolderReorder(all, ["f3"], "f1", "before"))).toEqual(["f3", "f1", "f2"]);
    expect(order(all, planFolderReorder(all, ["f1"], "f3", "after"))).toEqual(["f2", "f3", "f1"]);
  });

  it("brings a folder out of a branch when dropped beside a folder in another", () => {
    const all = tree();
    const writes = planFolderReorder(all, ["deep"], "f2", "after");
    expect(writes.find((w) => w.id === "deep")).toMatchObject({ parent_folder_id: null, sort_order: 2 });
    expect(order(all, writes)).toEqual(["f1", "f2", "deep", "f3"]);
  });

  it("writes nothing when the gap is where the folder already was", () => {
    expect(planFolderReorder(tree(), ["f2"], "f1", "after")).toEqual([]);
    expect(planFolderReorder(tree(), ["f2"], "f3", "before")).toEqual([]);
  });

  it("does nothing when the target is one of the folders being dragged", () => {
    expect(planFolderReorder(tree(), ["f1", "f2"], "f2", "before")).toEqual([]);
  });

  it("does nothing when the target is unknown", () => {
    expect(planFolderReorder(tree(), ["f1"], "nope", "before")).toEqual([]);
  });
});
