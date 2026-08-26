import { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { useDroppable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/useUserRole";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Checkbox } from "@/components/ui/checkbox";
import {
  FileText, Video, Link as LinkIcon, BookOpen, CheckSquare, FolderClosed, FolderOpen,
  MoreVertical, Trash2, Eye, Pencil, Bookmark, Download, FolderInput,
} from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { ResourceViewer } from "@/components/ResourceViewer";
import { EditResourceDialog } from "@/components/EditResourceDialog";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";

function formatFileSize(bytes?: number | null): string {
  if (!bytes) return "—";
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
  presentation: BookOpen,
};

interface BaseRowProps {
  selected: boolean;
  onClick: (e: React.MouseEvent) => void;
  canManage: boolean;
  isDropTarget?: boolean;
}

/* ---------- File Row ---------- */

interface FileRowProps extends BaseRowProps {
  resource: Tables<"resources">;
  existingSubheadings: string[];
  onDelete: (id: string) => void;
  onMove: (id: string) => void;
  onDownload: (id: string) => void;
}

export function FileRow({
  resource, selected, onClick, canManage, existingSubheadings,
  onDelete, onMove, onDownload,
}: FileRowProps) {
  const [viewerOpen, setViewerOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const { data: user } = useCurrentUser();
  const queryClient = useQueryClient();

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({
      id: resource.id,
      disabled: !canManage,
      data: { type: "resource", resourceId: resource.id },
    });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const Icon = typeIcons[resource.resource_type] || FileText;

  const { data: isBookmarked } = useQuery({
    queryKey: ["bookmark-status", resource.id, user?.id],
    queryFn: async () => {
      if (!user) return false;
      const { data } = await supabase
        .from("bookmarks").select("id")
        .eq("user_id", user.id).eq("resource_id", resource.id).maybeSingle();
      return !!data;
    },
    enabled: !!user,
  });

  const toggleBookmark = useMutation({
    mutationFn: async () => {
      if (!user) return;
      if (isBookmarked) {
        await supabase.from("bookmarks").delete()
          .eq("user_id", user.id).eq("resource_id", resource.id);
      } else {
        await supabase.from("bookmarks").insert({ user_id: user.id, resource_id: resource.id });
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
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            ref={setNodeRef}
            style={style}
            {...attributes}
            {...listeners}
            onClick={onClick}
            onDoubleClick={(e) => { e.stopPropagation(); setViewerOpen(true); }}
            className={`group flex items-center gap-3 rounded-md border px-3 py-2 cursor-pointer select-none transition-colors
              ${selected ? "bg-accent/10 border-accent/40" : "border-transparent hover:bg-secondary/60 hover:border-border"}
            `}
          >
            {canManage && (
              <Checkbox
                checked={selected}
                onClick={(e) => e.stopPropagation()}
                onCheckedChange={() => onClick({ shiftKey: false, metaKey: true, ctrlKey: false, stopPropagation() {}, preventDefault() {} } as any)}
                className="opacity-0 group-hover:opacity-100 data-[state=checked]:opacity-100 transition-opacity"
              />
            )}
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-secondary">
              <Icon className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{resource.title}</p>
              {resource.description && (
                <p className="truncate text-xs text-muted-foreground">{resource.description}</p>
              )}
            </div>
            <Badge variant="secondary" className="hidden sm:inline-flex text-[10px] shrink-0">
              {resource.resource_type.toUpperCase()}
            </Badge>
            <span className="hidden md:inline text-[11px] text-muted-foreground/70 w-20 text-right shrink-0">
              {formatFileSize((resource as any).file_size)}
            </span>
            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
              <Button variant="ghost" size="icon" className="h-7 w-7"
                onClick={(e) => { e.stopPropagation(); toggleBookmark.mutate(); }}
                title={isBookmarked ? "Remove bookmark" : "Bookmark"}>
                <Bookmark className={`h-3.5 w-3.5 ${isBookmarked ? "fill-current text-accent" : ""}`} />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7"
                onClick={(e) => { e.stopPropagation(); setViewerOpen(true); }} title="Open">
                <Eye className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7"
                onClick={(e) => { e.stopPropagation(); onDownload(resource.id); }} title="Download">
                <Download className="h-3.5 w-3.5" />
              </Button>
              {canManage && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                    <Button variant="ghost" size="icon" className="h-7 w-7">
                      <MoreVertical className="h-3.5 w-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                    <DropdownMenuItem onClick={() => setEditOpen(true)}>
                      <Pencil className="h-3.5 w-3.5 mr-2" /> Rename / Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onMove(resource.id)}>
                      <FolderInput className="h-3.5 w-3.5 mr-2" /> Move to…
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="text-destructive"
                      onClick={() => onDelete(resource.id)}>
                      <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onClick={() => setViewerOpen(true)}>
            <Eye className="h-3.5 w-3.5 mr-2" /> Open
          </ContextMenuItem>
          <ContextMenuItem onClick={() => onDownload(resource.id)}>
            <Download className="h-3.5 w-3.5 mr-2" /> Download
          </ContextMenuItem>
          <ContextMenuItem onClick={() => toggleBookmark.mutate()}>
            <Bookmark className="h-3.5 w-3.5 mr-2" /> {isBookmarked ? "Remove bookmark" : "Bookmark"}
          </ContextMenuItem>
          {canManage && (
            <>
              <ContextMenuSeparator />
              <ContextMenuItem onClick={() => setEditOpen(true)}>
                <Pencil className="h-3.5 w-3.5 mr-2" /> Rename / Edit
              </ContextMenuItem>
              <ContextMenuItem onClick={() => onMove(resource.id)}>
                <FolderInput className="h-3.5 w-3.5 mr-2" /> Move to…
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem className="text-destructive" onClick={() => onDelete(resource.id)}>
                <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
              </ContextMenuItem>
            </>
          )}
        </ContextMenuContent>
      </ContextMenu>
      <ResourceViewer resource={resource} open={viewerOpen} onOpenChange={setViewerOpen} />
      {canManage && <EditResourceDialog resource={resource} open={editOpen} onOpenChange={setEditOpen} existingSubheadings={existingSubheadings} />}
    </>
  );
}

/* ---------- Folder Row ---------- */

interface FolderRowProps extends BaseRowProps {
  folder: Tables<"resource_folders">;
  count: number;
  onOpen: () => void;
  onRename: () => void;
  onDelete: () => void;
  onDownload: () => void;
  downloading?: boolean;
}

export function FolderRow({
  folder, selected, onClick, canManage, count, onOpen, onRename, onDelete, onDownload,
  downloading, isDropTarget,
}: FolderRowProps) {
  const { attributes, listeners, setNodeRef: setSortRef, transform, transition, isDragging } =
    useSortable({
      id: `folder-row:${folder.id}`,
      disabled: !canManage,
      data: { type: "folder", folderId: folder.id },
    });
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `folder:${folder.id}`,
    data: { type: "folder-drop", folderId: folder.id },
  });

  const setRefs = (node: HTMLDivElement | null) => {
    setSortRef(node);
    setDropRef(node);
  };

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const active = isOver || isDropTarget;

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          ref={setRefs}
          style={style}
          {...attributes}
          {...listeners}
          onClick={onClick}
          onDoubleClick={(e) => { e.stopPropagation(); onOpen(); }}
          className={`group flex items-center gap-3 rounded-md border px-3 py-2 cursor-pointer select-none transition-colors
            ${active ? "ring-2 ring-accent bg-accent/10 border-accent" : selected ? "bg-accent/10 border-accent/40" : "border-transparent hover:bg-secondary/60 hover:border-border"}
          `}
        >
          {canManage && (
            <Checkbox
              checked={selected}
              onClick={(e) => e.stopPropagation()}
              onCheckedChange={() => onClick({ shiftKey: false, metaKey: true, ctrlKey: false, stopPropagation() {}, preventDefault() {} } as any)}
              className="opacity-0 group-hover:opacity-100 data-[state=checked]:opacity-100 transition-opacity"
            />
          )}
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/10">
            {active
              ? <FolderOpen className="h-4 w-4 text-accent" />
              : <FolderClosed className="h-4 w-4 text-accent" />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{folder.name}</p>
            <p className="text-xs text-muted-foreground">{count} item{count === 1 ? "" : "s"}</p>
          </div>
          <Badge variant="outline" className="hidden sm:inline-flex text-[10px] shrink-0">FOLDER</Badge>
          <span className="hidden md:inline w-20 text-right text-[11px] text-muted-foreground/70 shrink-0">—</span>
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
            <Button variant="ghost" size="icon" className="h-7 w-7"
              onClick={(e) => { e.stopPropagation(); onOpen(); }} title="Open">
              <Eye className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7"
              disabled={downloading}
              onClick={(e) => { e.stopPropagation(); onDownload(); }} title="Download folder">
              <Download className="h-3.5 w-3.5" />
            </Button>
            {canManage && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                  <Button variant="ghost" size="icon" className="h-7 w-7">
                    <MoreVertical className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                  <DropdownMenuItem onClick={onOpen}>
                    <FolderOpen className="h-3.5 w-3.5 mr-2" /> Open
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={onRename}>
                    <Pencil className="h-3.5 w-3.5 mr-2" /> Rename
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={onDownload} disabled={downloading}>
                    <Download className="h-3.5 w-3.5 mr-2" /> Download folder
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-destructive" onClick={onDelete}>
                    <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete folder
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={onOpen}>
          <FolderOpen className="h-3.5 w-3.5 mr-2" /> Open
        </ContextMenuItem>
        <ContextMenuItem onClick={onDownload} disabled={downloading}>
          <Download className="h-3.5 w-3.5 mr-2" /> Download
        </ContextMenuItem>
        {canManage && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem onClick={onRename}>
              <Pencil className="h-3.5 w-3.5 mr-2" /> Rename
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem className="text-destructive" onClick={onDelete}>
              <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete folder
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}
