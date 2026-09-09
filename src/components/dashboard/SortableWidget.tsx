import type { ReactNode } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";

/**
 * One dashboard widget, draggable while the dashboard is being customised.
 *
 * The handle used to be a 16px icon floating in the gutter to the left of the
 * card. On a phone that is both hard to hit and — because it sat outside the
 * card in a strip only as wide as the page padding — easy to miss entirely.
 * It is now a full-height button beside the card, so the target is the height
 * of the row rather than a few millimetres of icon.
 *
 * `touch-none` on the handle is what makes the press-and-hold reliable: without
 * it the browser may start scrolling the page from the handle before the hold
 * has completed, which cancels the drag. It is safe here precisely because the
 * handle is small — the rest of the card still scrolls the page normally.
 */
export function SortableWidget({
  id,
  label,
  children,
  isEditing,
}: {
  id: string;
  label?: string;
  children: ReactNode;
  isEditing: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  if (!isEditing) {
    return (
      <div ref={setNodeRef} style={style} className="group relative">
        {children}
      </div>
    );
  }

  return (
    <div ref={setNodeRef} style={style} className="group flex items-stretch gap-2">
      <button
        type="button"
        data-testid={`drag-handle-${id}`}
        {...attributes}
        {...listeners}
        aria-label={label ? `Reorder ${label}` : "Reorder widget"}
        className="flex w-10 shrink-0 touch-none cursor-grab items-center justify-center rounded-md border border-dashed text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
