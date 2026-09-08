import { describe, it, expect } from "vitest";
import { planReorder, type OrderableResource } from "./resourceOrdering";

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
  it("moves a row down to the position it was dropped on", () => {
    const all = flat();
    const writes = planReorder(all, ["a"], "c");
    expect(resulting(all, writes)).toEqual(["b", "c", "a", "d"]);
  });

  it("moves a row up to the position it was dropped on", () => {
    const all = flat();
    const writes = planReorder(all, ["d"], "b");
    expect(resulting(all, writes)).toEqual(["a", "d", "b", "c"]);
  });

  it("writes only the rows that actually shift", () => {
    const all = flat();
    // a and b swap; c and d never move, so they must not be written.
    const writes = planReorder(all, ["b"], "a");
    expect(resulting(all, writes)).toEqual(["b", "a", "c", "d"]);
    expect(writes.map((w) => w.id).sort()).toEqual(["a", "b"]);
  });

  it("keeps a multi-row selection in its own relative order", () => {
    const all = flat();
    // a and b came from above d, so the pair lands after it — and stays a,b.
    const writes = planReorder(all, ["a", "b"], "d");
    expect(resulting(all, writes)).toEqual(["c", "d", "a", "b"]);
  });

  // The rule the whole thing turns on, stated on its own so it cannot drift:
  // dropping on a row puts the dragged rows after it when they came from above,
  // and before it when they came from below. That is dnd-kit's arrayMove, which
  // is what the drag preview animates.
  it("lands after the target coming down, and before it going up", () => {
    expect(resulting(flat(), planReorder(flat(), ["a"], "c"))).toEqual(["b", "c", "a", "d"]);
    expect(resulting(flat(), planReorder(flat(), ["c"], "a"))).toEqual(["c", "a", "b", "d"]);
  });

  it("carries a row into the list it was dropped into", () => {
    const all: OrderableResource[] = [
      { id: "x", folder_id: null, subheading: "Exams", sort_order: 0 },
      { id: "p", folder_id: null, subheading: "Guidelines", sort_order: 0 },
      { id: "q", folder_id: null, subheading: "Guidelines", sort_order: 1 },
    ];
    const writes = planReorder(all, ["x"], "q");
    const moved = writes.find((w) => w.id === "x");
    expect(moved).toMatchObject({ subheading: "Guidelines", folder_id: null, sort_order: 1 });
    expect(resulting(all, writes).slice(0, 3)).toEqual(["p", "x", "q"]);
  });

  it("carries a row into a folder when dropped on a row inside one", () => {
    const all: OrderableResource[] = [
      { id: "loose", folder_id: null, subheading: null, sort_order: 0 },
      { id: "inside", folder_id: "f1", subheading: null, sort_order: 0 },
    ];
    const writes = planReorder(all, ["loose"], "inside");
    expect(writes.find((w) => w.id === "loose")).toMatchObject({ folder_id: "f1", sort_order: 0 });
  });

  it("does nothing when the target is part of the dragged selection", () => {
    const all = flat();
    expect(planReorder(all, ["a", "b"], "b")).toEqual([]);
  });

  it("does nothing when the target row is unknown", () => {
    expect(planReorder(flat(), ["a"], "missing")).toEqual([]);
  });

  it("does nothing when nothing recognisable is being dragged", () => {
    expect(planReorder(flat(), ["ghost"], "c")).toEqual([]);
  });

  it("normalises a list whose sort_order values are absent or duplicated", () => {
    const all: OrderableResource[] = [
      { id: "a", folder_id: null, subheading: null, sort_order: null },
      { id: "b", folder_id: null, subheading: null, sort_order: null },
      { id: "c", folder_id: null, subheading: null, sort_order: 5 },
    ];
    const writes = planReorder(all, ["c"], "a");
    expect(resulting(all, writes)).toEqual(["c", "a", "b"]);
    expect(writes.map((w) => w.sort_order)).toEqual([0, 1, 2]);
  });
});
