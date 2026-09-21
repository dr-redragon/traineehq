import { insertItems } from "@/lib/dnd";

/**
 * What a drop on the dashboard should save.
 *
 * The dashboard stores two things: one ordered list of every widget, and the
 * set that lives in the right-hand column. Which column a widget is in and
 * where it sits in that column are therefore the same fact stored twice over,
 * and keeping them in step is the part that was quietly wrong before — a
 * cross-column drag rebuilt the order by splicing four filtered arrays back
 * together, and a widget could come back in a different place from the one the
 * drop indicator had promised.
 *
 * Here it is one rule: rebuild the column the widget landed in, leave the other
 * alone, and write the whole thing back as left-then-right. Because the layout
 * is read back as "visible ones in order", left before right is not cosmetic —
 * it is what makes the saved order survive a switch back to one column.
 */

export interface WidgetDrop<T extends string = string> {
  /** Every widget, in order, including hidden ones. */
  layout: T[];
  hidden: T[];
  /** The widgets currently in the right-hand column. */
  right: T[];
  /** What is being dragged. */
  moving: T[];
  /** Where it is going. */
  target: { column: "left" | "right"; slot: number };
  /** One column, or two. In one column there is nowhere else to be. */
  columns: 1 | 2;
}

export interface WidgetLayoutWrite<T extends string = string> {
  widget_layout: T[];
  right_column_widgets: T[];
}

export function planWidgetDrop<T extends string>({
  layout, hidden, right, moving, target, columns,
}: WidgetDrop<T>): WidgetLayoutWrite<T> {
  const hiddenSet = new Set(hidden);
  const visible = layout.filter((w) => !hiddenSet.has(w));

  if (columns === 1) {
    const reordered = insertItems(visible, moving, target.slot, (w) => w);
    return {
      widget_layout: [...reordered, ...layout.filter((w) => hiddenSet.has(w))],
      right_column_widgets: right,
    };
  }

  const movingSet = new Set(moving);
  const rightSet = new Set(right);

  // The columns as they stand, minus anything in flight.
  const columnOf = (side: "left" | "right") =>
    visible.filter((w) => (side === "right" ? rightSet.has(w) : !rightSet.has(w)));

  const landing = insertItems(columnOf(target.column), moving, target.slot, (w) => w);
  const other = columnOf(target.column === "right" ? "left" : "right")
    .filter((w) => !movingSet.has(w));

  const left = target.column === "left" ? landing : other;
  const rightColumn = target.column === "right" ? landing : other;

  return {
    widget_layout: [...left, ...rightColumn, ...layout.filter((w) => hiddenSet.has(w))],
    right_column_widgets: rightColumn,
  };
}
