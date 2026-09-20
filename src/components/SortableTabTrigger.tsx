import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { TabsTrigger } from "@/components/ui/tabs";
import { GripVertical } from "lucide-react";
import { type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface SortableTabTriggerProps {
  id: string;
  value: string;
  children: ReactNode;
  canDrag: boolean;
  /** Classes for the drag wrapper — the sub-rail needs it full width. */
  className?: string;
  /** Shown at the far end of the row, as the sub-rail's item count. */
  meta?: ReactNode;
}

export function SortableTabTrigger({ id, value, children, canDrag, className, meta }: SortableTabTriggerProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled: !canDrag });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    cursor: canDrag ? "grab" : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn("flex items-center", className)}
      {...(canDrag ? { ...attributes, ...listeners } : {})}
    >
      <TabsTrigger value={value} className="gap-1 whitespace-nowrap text-xs">
        <span className="flex min-w-0 items-baseline gap-1.5">
          {canDrag && <GripVertical className="h-3 w-3 shrink-0 self-center text-muted-foreground" />}
          {children}
        </span>
        {meta}
      </TabsTrigger>
    </div>
  );
}
