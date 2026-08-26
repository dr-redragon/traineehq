import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { SubheadingGroup } from "@/components/SubheadingGroup";
import { ResourceCard } from "@/components/ResourceCard";
import { FileDropOverlay } from "@/components/FileDropOverlay";
import type { Tables } from "@/integrations/supabase/types";

interface DroppableSubheadingGroupProps {
  groupId: string;
  name: string;
  resources: Tables<"resources">[];
  canManage: boolean;
  onDelete: (id: string) => void;
  existingSubheadings: string[];
  selectable?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  activeDropTargetId?: string | null;
}

export function DroppableSubheadingGroup({
  groupId,
  name,
  resources,
  canManage,
  onDelete,
  existingSubheadings,
  selectable,
  selectedIds,
  onToggleSelect,
  activeDropTargetId,
}: DroppableSubheadingGroupProps) {
  const { setNodeRef, isOver } = useDroppable({ id: `group:${groupId}` });
  const containerId = `group:${groupId}`;
  const isActiveDropTarget = activeDropTargetId === containerId;

  return (
    <SubheadingGroup
      name={name}
      resourceIds={resources.map((r) => r.id)}
      canManage={canManage}
    >
      <div
        ref={setNodeRef}
        className={`relative min-h-[40px] rounded-md transition-colors ${isOver || isActiveDropTarget ? "bg-accent/10" : ""}`}
      >
        <FileDropOverlay
          active={(isOver || isActiveDropTarget) && resources.length > 0}
          compact
          variant="move"
          label={name ? `Move into "${name}"` : "Move here"}
        />
        <SortableContext items={resources.map((r) => r.id)} strategy={verticalListSortingStrategy}>
          {resources.length === 0 ? (
            <div className={`flex items-center justify-center py-6 text-xs border border-dashed rounded-md transition-colors ${isOver ? "border-accent text-accent bg-accent/5" : "text-muted-foreground"}`}>
              {isOver ? "Drop here to move" : "No resources yet — drag here or use \"Add Resource\""}
            </div>
          ) : (
            <div className="space-y-2">
              {resources.map((r) => (
                <ResourceCard
                  key={r.id}
                  resource={r}
                  containerId={containerId}
                  canManage={canManage}
                  onDelete={onDelete}
                  existingSubheadings={existingSubheadings}
                  selectable={selectable}
                  selected={selectedIds?.has(r.id)}
                  onToggleSelect={onToggleSelect}
                />
              ))}
            </div>
          )}
        </SortableContext>
      </div>
    </SubheadingGroup>
  );
}

interface DroppableUngroupedProps {
  resources: Tables<"resources">[];
  canManage: boolean;
  onDelete: (id: string) => void;
  existingSubheadings: string[];
  selectable?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  activeDropTargetId?: string | null;
}

export function DroppableUngrouped({
  resources,
  canManage,
  onDelete,
  existingSubheadings,
  selectable,
  selectedIds,
  onToggleSelect,
  activeDropTargetId,
}: DroppableUngroupedProps) {
  const { setNodeRef, isOver } = useDroppable({ id: "group:__ungrouped__" });
  const containerId = "group:__ungrouped__";
  const isActiveDropTarget = activeDropTargetId === containerId;

  return (
    <div
      ref={setNodeRef}
      className={`relative min-h-[20px] rounded-md transition-colors ${isOver || isActiveDropTarget ? "bg-accent/10" : ""}`}
    >
      <FileDropOverlay
        active={(isOver || isActiveDropTarget) && resources.length > 0}
        compact
        variant="move"
        label="Move to ungrouped"
      />
      <SortableContext items={resources.map((r) => r.id)} strategy={verticalListSortingStrategy}>
        {resources.length === 0 && (isOver || isActiveDropTarget) ? (
          <div className="flex items-center justify-center py-6 text-xs text-accent border border-dashed border-accent rounded-md bg-accent/5">
            Drop here to move
          </div>
        ) : (
          <div className="space-y-2">
            {resources.map((r) => (
              <ResourceCard
                key={r.id}
                resource={r}
                containerId={containerId}
                canManage={canManage}
                onDelete={onDelete}
                existingSubheadings={existingSubheadings}
                selectable={selectable}
                selected={selectedIds?.has(r.id)}
                onToggleSelect={onToggleSelect}
              />
            ))}
          </div>
        )}
      </SortableContext>
    </div>
  );
}
