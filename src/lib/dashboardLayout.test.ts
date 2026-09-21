import { describe, expect, it } from "vitest";

import { planWidgetDrop } from "./dashboardLayout";

const base = {
  layout: ["a", "b", "c", "d", "hidden1"],
  hidden: ["hidden1"],
  right: ["c", "d"],
};

describe("planWidgetDrop", () => {
  it("reorders within one column", () => {
    const result = planWidgetDrop({
      ...base, right: [], columns: 1, moving: ["a"], target: { column: "left", slot: 3 },
    });
    expect(result.widget_layout).toEqual(["b", "c", "a", "d", "hidden1"]);
  });

  it("keeps hidden widgets at the end, in their own order", () => {
    const result = planWidgetDrop({
      layout: ["a", "b", "x", "y"], hidden: ["x", "y"], right: [],
      columns: 1, moving: ["b"], target: { column: "left", slot: 0 },
    });
    expect(result.widget_layout).toEqual(["b", "a", "x", "y"]);
  });

  it("reorders inside the right column without touching the left", () => {
    const result = planWidgetDrop({
      ...base, columns: 2, moving: ["d"], target: { column: "right", slot: 0 },
    });
    expect(result.right_column_widgets).toEqual(["d", "c"]);
    expect(result.widget_layout).toEqual(["a", "b", "d", "c", "hidden1"]);
  });

  it("moves a widget across to the other column at the gap it was dropped in", () => {
    const result = planWidgetDrop({
      ...base, columns: 2, moving: ["a"], target: { column: "right", slot: 1 },
    });
    expect(result.right_column_widgets).toEqual(["c", "a", "d"]);
    expect(result.widget_layout).toEqual(["b", "c", "a", "d", "hidden1"]);
  });

  it("takes a widget out of the right column when it lands on the left", () => {
    const result = planWidgetDrop({
      ...base, columns: 2, moving: ["c"], target: { column: "left", slot: 1 },
    });
    expect(result.right_column_widgets).toEqual(["d"]);
    expect(result.widget_layout).toEqual(["a", "c", "b", "d", "hidden1"]);
  });

  it("drops onto an empty column", () => {
    const result = planWidgetDrop({
      layout: ["a", "b"], hidden: [], right: [],
      columns: 2, moving: ["a"], target: { column: "right", slot: 0 },
    });
    expect(result.right_column_widgets).toEqual(["a"]);
    expect(result.widget_layout).toEqual(["b", "a"]);
  });

  it("saves the layout left column first, so one column keeps the same order", () => {
    // Read back as a single list, the two columns have to concatenate in the
    // order they are read on screen.
    const result = planWidgetDrop({
      ...base, columns: 2, moving: ["b"], target: { column: "right", slot: 2 },
    });
    expect(result.widget_layout.slice(0, 4)).toEqual(["a", "c", "d", "b"]);
  });
});
