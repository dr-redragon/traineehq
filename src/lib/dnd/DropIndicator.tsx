import { cn } from "@/lib/utils";

import type { DragAxis, DropEdge } from "./types";

/**
 * The line that says where the thing in your hand will land.
 *
 * It is drawn in the gap itself rather than by shuffling the rows around it,
 * which is the other way a list can show this and the more fragile one: shifted
 * rows have to be measured, animated and then agreed with by whatever writes
 * the new order, and when they disagree an item settles one place away from
 * where you watched it go. A line in a gap is the gap the code will use.
 *
 * The row it sits on must be positioned (`relative`); it is `pointer-events:
 * none` so it can never become the thing under the pointer.
 */
export function DropIndicator({
  edge, axis = "vertical", className,
}: {
  edge: DropEdge | null;
  axis?: DragAxis;
  className?: string;
}) {
  if (!edge || edge === "into") return null;

  const vertical = axis === "vertical";

  return (
    <span
      aria-hidden
      data-dnd-indicator={edge}
      className={cn(
        "pointer-events-none absolute z-10 bg-rule",
        vertical
          ? "left-0 right-0 h-0.5"
          : "bottom-0 top-0 w-0.5",
        vertical
          ? (edge === "before" ? "-top-px" : "-bottom-px")
          : (edge === "before" ? "-left-px" : "-right-px"),
        className,
      )}
    >
      {/* A blob at the leading end, so the line reads as an insertion point
          rather than as one more rule in a page made of rules. */}
      <span
        className={cn(
          "absolute h-2 w-2 rounded-full bg-rule",
          vertical ? "-left-0.5 -top-[3px]" : "-left-[3px] -top-0.5",
        )}
      />
    </span>
  );
}
