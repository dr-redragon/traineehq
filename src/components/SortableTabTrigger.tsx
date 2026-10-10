import { type ReactNode } from "react";
import { GripVertical } from "lucide-react";

import { TabsTrigger } from "@/components/ui/tabs";
import {
  DropIndicator, useDragState, useSortableItem, type DragData, type DragSource,
} from "@/lib/dnd";
import { cn } from "@/lib/utils";

interface SortableTabTriggerProps {
  id: string;
  value: string;
  children: ReactNode;
  canDrag: boolean;
  /** Its place in the rail, which is what a drop is measured against. */
  index?: number;
  /** Classes for the drag wrapper — the sub-rail needs it full width. */
  className?: string;
  /** Shown at the far end of the row, as the sub-rail's item count. */
  meta?: ReactNode;
  /** The section's name, for the handle's label. */
  label?: string;
  /** Carried with the drag, and seen by whatever it is dropped on. */
  data?: DragData;
  /**
   * Drags from elsewhere that this tab takes *in* rather than sorts around —
   * files and folders dropped on a category's name to move them there.
   *
   * While one of those is in the hand the whole tab is a single target, with
   * no before or after: there is no gap between categories to put a file in.
   */
  dropInto?: (source: DragSource) => boolean;
}

/**
 * A section in the rail, which can be dragged into a different order.
 *
 * The grip is the handle and the rest of the row is not. A tab is first of all
 * something you click to go somewhere, and a row that both navigates and drags
 * from the same pixels has to guess which you meant every time it is touched —
 * the old version guessed, and got it wrong often enough that the rail felt
 * unpredictable.
 *
 * It sits *beside* the trigger in the markup rather than inside it, because a
 * button inside a button is neither valid nor operable, and is drawn over the
 * trigger's left padding so the rail still reads as one flush-left column.
 *
 * The rail itself is desktop-only — below `lg` the sections are a dropdown, and
 * reordering them there is the arrows in the sections dialog, which is a better
 * gesture on a phone than any drag in a 40px-tall strip.
 */
export function SortableTabTrigger({
  id, value, children, canDrag, className, meta, index, label, data, dropInto,
}: SortableTabTriggerProps) {
  const { source } = useDragState();
  const taking = !!source && !!dropInto?.(source);
  const { ref, itemProps, dropProps, handleProps, edge, isDragging } = useSortableItem({
    id,
    index,
    data,
    disabled: !canDrag,
    label: label ? `Reorder ${label}` : "Reorder section",
    mode: taking ? "into" : "between",
    // Another tab, for a reorder; or something this tab takes in. A file over
    // a tab that will not have it must not be offered a gap beside it either.
    accepts: (dragged) => dragged.data.kind === data?.kind || !!dropInto?.(dragged as DragSource),
  });
  const highlighted = canDrag && edge === "into";

  return (
    <div
      ref={ref}
      {...itemProps}
      {...(canDrag ? dropProps : {})}
      className={cn(
        "relative flex items-center transition-colors",
        highlighted && "bg-accent-strong ring-2 ring-inset ring-rule",
        className,
      )}
    >
      <DropIndicator edge={canDrag ? edge : null} />
      {canDrag && (
        <button
          type="button"
          {...handleProps}
          className={cn(
            "absolute bottom-0 left-0 top-0 z-10 flex w-[18px] items-center justify-center text-muted-foreground/70 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
            isDragging && "text-foreground",
          )}
        >
          <GripVertical className="h-3 w-3" aria-hidden />
        </button>
      )}
      <TabsTrigger value={value} className="gap-1 whitespace-nowrap text-xs">
        <span className="flex min-w-0 items-baseline gap-1.5">{children}</span>
        {meta}
      </TabsTrigger>
    </div>
  );
}
