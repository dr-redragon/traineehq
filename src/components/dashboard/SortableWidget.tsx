import type { ReactNode } from "react";
import { GripVertical } from "lucide-react";

import { DropIndicator, useSortableItem } from "@/lib/dnd";

/**
 * One dashboard widget, draggable while the dashboard is being customised.
 *
 * The handle is a full-height button beside the card rather than a small icon
 * floating in the gutter: the target is then the height of the row, which is
 * the difference between a gesture that works on a phone and one that does not.
 * Everything about *how* it drags — what counts as a hold, what follows your
 * finger, where it lands — belongs to the engine in `@/lib/dnd`; this only says
 * which element is the row and which is its grip.
 *
 * The whole row is also a drop target, so a widget can be dropped on it from
 * either column, and the line drawn at its edge is the gap that will be written.
 */
export function SortableWidget({
  id, label, children, isEditing, index, column,
}: {
  id: string;
  label?: string;
  children: ReactNode;
  isEditing: boolean;
  /** Position within its own column, which is what a drop is measured against. */
  index?: number;
  column?: "left" | "right";
}) {
  const { ref, itemProps, dropProps, handleProps, edge, isDragging } = useSortableItem({
    id,
    index,
    data: { column },
    disabled: !isEditing,
    label: label ? `Reorder ${label}` : "Reorder widget",
  });

  if (!isEditing) {
    return <div className="group relative">{children}</div>;
  }

  return (
    <div
      ref={ref}
      {...itemProps}
      {...dropProps}
      className="group relative flex items-stretch gap-2"
    >
      <DropIndicator edge={edge} />
      <button
        type="button"
        data-testid={`drag-handle-${id}`}
        {...handleProps}
        aria-describedby={`${id}-drag-hint`}
        className="flex w-10 shrink-0 items-center justify-center rounded-md border border-dashed text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <span id={`${id}-drag-hint`} className="sr-only">
        Press and hold to drag, or use the up and down arrow keys to move it.
      </span>
      <div className={`min-w-0 flex-1 ${isDragging ? "pointer-events-none" : ""}`}>{children}</div>
    </div>
  );
}
