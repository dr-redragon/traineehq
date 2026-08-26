import { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/useUserRole";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  FileText, Video, LinkIcon, BookOpen, CheckSquare, FolderOpen,
  GripVertical, Trash2, Eye, Pencil, Bookmark, Square,
} from "lucide-react";
import { ResourceViewer } from "@/components/ResourceViewer";
import { EditResourceDialog } from "@/components/EditResourceDialog";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

const typeIcons: Record<string, typeof FileText> = {
  pdf: FileText,
  video: Video,
  link: LinkIcon,
  document: BookOpen,
  checklist: CheckSquare,
  folder: FolderOpen,
  presentation: BookOpen,
};

interface ResourceCardProps {
  resource: Tables<"resources">;
  canManage: boolean;
  onDelete?: (id: string) => void;
  existingSubheadings?: string[];
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
  containerId?: string;
}

export function ResourceCard({ resource, canManage, onDelete, existingSubheadings = [], selectable, selected, onToggleSelect, containerId }: ResourceCardProps) {
  const [viewerOpen, setViewerOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const { data: user } = useCurrentUser();
  const queryClient = useQueryClient();

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({
      id: resource.id,
      disabled: !canManage || !!selectable,
      data: {
        type: "resource",
        resourceId: resource.id,
        containerId,
      },
    });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.15 : 1,
  };

  const Icon = typeIcons[resource.resource_type] || FileText;

  const { data: isBookmarked } = useQuery({
    queryKey: ["bookmark-status", resource.id, user?.id],
    queryFn: async () => {
      if (!user) return false;
      const { data } = await supabase
        .from("bookmarks")
        .select("id")
        .eq("user_id", user.id)
        .eq("resource_id", resource.id)
        .maybeSingle();
      return !!data;
    },
    enabled: !!user,
  });

  const toggleBookmark = useMutation({
    mutationFn: async () => {
      if (!user) return;
      if (isBookmarked) {
        await supabase
          .from("bookmarks")
          .delete()
          .eq("user_id", user.id)
          .eq("resource_id", resource.id);
      } else {
        await supabase
          .from("bookmarks")
          .insert({ user_id: user.id, resource_id: resource.id });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bookmark-status", resource.id] });
      queryClient.invalidateQueries({ queryKey: ["my-bookmarks"] });
      toast.success(isBookmarked ? "Bookmark removed" : "Resource bookmarked");
    },
  });

  return (
    <>
      <div ref={setNodeRef} style={style}>
        <Card
          className={`cursor-pointer transition-all ${selected ? "ring-2 ring-accent/50 bg-accent/5" : ""} ${isDragging ? "scale-[0.985] shadow-xl ring-2 ring-accent/40" : "hover:shadow-sm hover:border-accent/30"}`}
          onClick={() => selectable ? onToggleSelect?.(resource.id) : setViewerOpen(true)}
        >
          <CardContent className="flex items-center gap-3 p-3">
            {selectable && (
              <button
                className="shrink-0 text-muted-foreground hover:text-accent"
                onClick={(e) => { e.stopPropagation(); onToggleSelect?.(resource.id); }}
              >
                {selected ? <CheckSquare className="h-4 w-4 text-accent" /> : <Square className="h-4 w-4" />}
              </button>
            )}
            {canManage && !selectable && (
              <button
                {...attributes}
                {...listeners}
                className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground touch-none"
                onClick={(e) => e.stopPropagation()}
              >
                <GripVertical className="h-4 w-4" />
              </button>
            )}
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-secondary">
              <Icon className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="text-sm font-medium truncate">{resource.title}</h4>
              <div className="flex items-center gap-2">
                {resource.description && (
                  <p className="text-xs text-muted-foreground line-clamp-1">{resource.description}</p>
                )}
                {(resource as any).file_size && (
                  <span className="text-[10px] text-muted-foreground/70 shrink-0">{formatFileSize((resource as any).file_size)}</span>
                )}
              </div>
            </div>
            <Badge variant="secondary" className="text-[10px] shrink-0">{resource.resource_type.toUpperCase()}</Badge>
            <Button
              variant="ghost"
              size="icon"
              className={`h-7 w-7 shrink-0 ${isBookmarked ? "text-accent" : "text-muted-foreground hover:text-accent"}`}
              onClick={(e) => { e.stopPropagation(); toggleBookmark.mutate(); }}
              title={isBookmarked ? "Remove bookmark" : "Bookmark resource"}
            >
              <Bookmark className={`h-4 w-4 ${isBookmarked ? "fill-current" : ""}`} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0 text-muted-foreground hover:text-accent"
              onClick={(e) => { e.stopPropagation(); setViewerOpen(true); }}
            >
              <Eye className="h-4 w-4" />
            </Button>
            {canManage && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0 text-muted-foreground hover:text-accent"
                onClick={(e) => { e.stopPropagation(); setEditOpen(true); }}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            )}
            {canManage && onDelete && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={(e) => { e.stopPropagation(); onDelete(resource.id); }}
              >
                <Trash2 className="h-3.5 w-3.5 text-destructive" />
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
      <ResourceViewer resource={resource} open={viewerOpen} onOpenChange={setViewerOpen} />
      {canManage && <EditResourceDialog resource={resource} open={editOpen} onOpenChange={setEditOpen} existingSubheadings={existingSubheadings} />}
    </>
  );
}

export function ResourceDragPreview({ resource }: { resource: Tables<"resources"> }) {
  const Icon = typeIcons[resource.resource_type] || FileText;

  return (
    <div className="w-[min(34rem,calc(100vw-2rem))] rotate-[1.5deg]">
      <Card className="border-accent/40 bg-card shadow-2xl ring-2 ring-accent/20">
        <CardContent className="flex items-center gap-3 p-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-secondary">
            <Icon className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="min-w-0 flex-1">
            <h4 className="truncate text-sm font-medium">{resource.title}</h4>
            <p className="truncate text-xs text-muted-foreground">
              Dragging resource
            </p>
          </div>
          <Badge variant="secondary" className="shrink-0 text-[10px]">
            {resource.resource_type.toUpperCase()}
          </Badge>
        </CardContent>
      </Card>
    </div>
  );
}
