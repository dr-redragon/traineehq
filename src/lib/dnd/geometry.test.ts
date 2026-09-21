import { describe, expect, it } from "vitest";

import {
  autoScrollStep, distance, edgeForPoint, insertItems, moveItems, slotForEdge,
  type Box,
} from "./geometry";

const row: Box = { top: 100, left: 0, width: 300, height: 40 };
const id = (s: string) => s;

describe("edgeForPoint", () => {
  it("splits an ordinary row down the middle", () => {
    expect(edgeForPoint(row, { x: 10, y: 105 }, "vertical")).toBe("before");
    expect(edgeForPoint(row, { x: 10, y: 135 }, "vertical")).toBe("after");
  });

  it("puts the midpoint itself after the row, so there is no dead line", () => {
    expect(edgeForPoint(row, { x: 10, y: 120 }, "vertical")).toBe("after");
  });

  it("measures along the axis it is given", () => {
    const rail: Box = { top: 0, left: 200, width: 100, height: 40 };
    expect(edgeForPoint(rail, { x: 210, y: 20 }, "horizontal")).toBe("before");
    expect(edgeForPoint(rail, { x: 290, y: 20 }, "horizontal")).toBe("after");
  });

  it("swallows anything dropped on a container", () => {
    expect(edgeForPoint(row, { x: 10, y: 102 }, "vertical", "into")).toBe("into");
    expect(edgeForPoint(row, { x: 10, y: 138 }, "vertical", "into")).toBe("into");
  });

  it("gives a folder row edges to reorder by and a middle that swallows", () => {
    // Top and bottom bands reorder; the middle two-fifths moves into it.
    expect(edgeForPoint(row, { x: 10, y: 103 }, "vertical", "both")).toBe("before");
    expect(edgeForPoint(row, { x: 10, y: 120 }, "vertical", "both")).toBe("into");
    expect(edgeForPoint(row, { x: 10, y: 137 }, "vertical", "both")).toBe("after");
  });

  it("survives a row with no height", () => {
    const flat: Box = { top: 50, left: 0, width: 100, height: 0 };
    expect(edgeForPoint(flat, { x: 10, y: 50 }, "vertical")).toBe("before");
    expect(edgeForPoint(flat, { x: 10, y: 50 }, "vertical", "both")).toBe("into");
  });
});

describe("slotForEdge", () => {
  it("turns a row and a side into the gap between rows", () => {
    expect(slotForEdge(3, "before")).toBe(3);
    expect(slotForEdge(3, "after")).toBe(4);
  });
});

describe("moveItems", () => {
  const list = ["a", "b", "c", "d"];

  it("moves a single item down to the gap it was dropped in", () => {
    // The line was drawn under c, which is the gap at 3.
    expect(moveItems(list, ["a"], 3, id)).toEqual(["b", "c", "a", "d"]);
  });

  it("moves a single item up", () => {
    expect(moveItems(list, ["d"], 1, id)).toEqual(["a", "d", "b", "c"]);
  });

  it("leaves the list alone when the gap is where the item already is", () => {
    // Both gaps either side of an item are where it already is, which is what
    // makes a drop that changes nothing write nothing.
    expect(moveItems(list, ["b"], 1, id)).toEqual(list);
    expect(moveItems(list, ["b"], 2, id)).toEqual(list);
  });

  it("keeps a multi-item selection in its own order", () => {
    expect(moveItems(list, ["a", "c"], 4, id)).toEqual(["b", "d", "a", "c"]);
  });

  it("discounts the items it lifted out when counting to the gap", () => {
    // Without the discount, moving a and b to the gap at 3 would land them at
    // index 3 of a two-item remainder — that is, at the end.
    expect(moveItems(list, ["a", "b"], 3, id)).toEqual(["c", "a", "b", "d"]);
  });

  it("clamps a gap beyond either end", () => {
    expect(moveItems(list, ["a"], 99, id)).toEqual(["b", "c", "d", "a"]);
    expect(moveItems(list, ["d"], -5, id)).toEqual(["d", "a", "b", "c"]);
  });

  it("does nothing when nothing recognisable is being moved", () => {
    expect(moveItems(list, ["ghost"], 2, id)).toEqual(list);
    expect(moveItems(list, [], 2, id)).toEqual(list);
  });
});

describe("insertItems", () => {
  it("brings an item in from another list", () => {
    expect(insertItems(["a", "b"], ["x"], 1, id)).toEqual(["a", "x", "b"]);
  });

  it("appends when the gap is past the end", () => {
    expect(insertItems(["a", "b"], ["x"], 9, id)).toEqual(["a", "b", "x"]);
  });

  it("is a move when the item is already in the list", () => {
    expect(insertItems(["a", "b", "c"], ["a"], 3, id)).toEqual(["b", "c", "a"]);
  });
});

describe("autoScrollStep", () => {
  const view: Box = { top: 0, left: 0, width: 400, height: 800 };

  it("stays still in the middle", () => {
    expect(autoScrollStep(view, { x: 200, y: 400 })).toEqual({ x: 0, y: 0 });
  });

  it("creeps upwards near the top and downwards near the bottom", () => {
    expect(autoScrollStep(view, { x: 200, y: 10 }).y).toBeLessThan(0);
    expect(autoScrollStep(view, { x: 200, y: 790 }).y).toBeGreaterThan(0);
  });

  it("moves faster the closer to the edge it gets", () => {
    const near = Math.abs(autoScrollStep(view, { x: 200, y: 5 }).y);
    const far = Math.abs(autoScrollStep(view, { x: 200, y: 60 }).y);
    expect(near).toBeGreaterThan(far);
  });

  it("runs flat out once the pointer is past the edge", () => {
    expect(autoScrollStep(view, { x: 200, y: -40 })).toMatchObject({ y: -18 });
    expect(autoScrollStep(view, { x: 200, y: 900 })).toMatchObject({ y: 18 });
  });

  it("scrolls sideways for a rail", () => {
    const rail: Box = { top: 0, left: 0, width: 1000, height: 48 };
    expect(autoScrollStep(rail, { x: 5, y: 24 }).x).toBeLessThan(0);
    expect(autoScrollStep(rail, { x: 995, y: 24 }).x).toBeGreaterThan(0);
  });
});

describe("distance", () => {
  it("measures the travel that tells a drag from a click", () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });
});
