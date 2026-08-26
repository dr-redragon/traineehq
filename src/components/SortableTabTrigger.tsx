import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { TabsTrigger } from "@/components/ui/tabs";
import { GripVertical } from "lucide-react";
import { type ReactNode } from "react";

interface SortableTabTriggerProps {
  id: string;
  value: string;
  children: ReactNode;
  canDrag: boolean;
}

export function SortableTabTrigger({ id, value, children, canDrag }: SortableTabTriggerProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled: !canDrag });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    cursor: canDrag ? "grab" : undefined,
  };

  return (
    <div ref={setNodeRef} style={style} className="flex items-center" {...(canDrag ? { ...attributes, ...listeners } : {})}>
      <TabsTrigger value={value} className="text-xs whitespace-nowrap gap-1">
        {canDrag && <GripVertical className="h-3 w-3 text-muted-foreground/50 shrink-0" />}
        {children}
      </TabsTrigger>
    </div>
  );
}
