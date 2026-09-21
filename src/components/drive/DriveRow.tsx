import { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { useDroppable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/useUserRole";
import { Button } from "@/components/ui/button";
import {
  ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Checkbox } from "@/components/ui/checkbox";
import {
  FolderClosed, FolderOpen, ChevronRight, FolderPlus,
  MoreVertical, Trash2, Eye, Pencil, Bookmark, Download, FolderInput,
} from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { ResourceViewer } from "@/components/ResourceViewer";
import { EditResourceDialog } from "@/components/EditResourceDialog";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";

/** The design's Updated column: relative for anything recent, a month for the rest. */
function formatWhen(date?: string | null): string {
  if (!date) return "—";
  const d = new Date(date);
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days < 1) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 14) return "1 week ago";
  if (days < 31) return `${Math.floor(days / 7)} weeks ago`;
  return d.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
}

function formatFileSize(bytes?: number | null): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/** One indent step per level, matching the disclosure arrow's width. */
const INDENT_PX = 22;

interface BaseRowProps {
  selected: boolean;
  /** How deep in the tree this row sits. 0 is the current view's own level. */
  depth?: number;
  onClick: (e: React.MouseEvent) => void;
  canManage: boolean;
  /** Selection mode: checkboxes stay visible and a tap never opens the item. */
  selectMode?: boolean;
  isDropTarget?: boolean;
}

/* ---------- File Row ---------- */

interface FileRowProps extends BaseRowProps {
  resource: Tables<"resources">;
  onDelete: (id: string) => void;
  onMove: (id: string) => void;
  onDownload: (id: string) => void;
}

export function FileRow({
  resource, selected, onClick, canManage, selectMode, depth = 0,
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
    // Padding rather than margin: the row keeps its full width, so its hover
    // fill and its bottom rule still run the whole way across the list. An
    // indented margin would leave a ragged left edge on every nested row.
    paddingLeft: depth ? `${4 + depth * INDENT_PX}px` : undefined,
  };


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
            onDoubleClick={(e) => { e.stopPropagation(); if (!selectMode) setViewerOpen(true); }}
            className={`group relative flex cursor-pointer select-none items-center gap-4 border-b border-border px-1 py-3 transition-colors
              ${selected ? "bg-accent-strong" : "hover:bg-accent"}
            `}
          >
            {(canManage || selectMode) && (
              <Checkbox
                checked={selected}
                onClick={(e) => e.stopPropagation()}
                onCheckedChange={() => onClick({ shiftKey: false, metaKey: true, ctrlKey: false, stopPropagation() {}, preventDefault() {} } as any)}
                className={selectMode
                  ? "shrink-0"
                  : "opacity-0 group-hover:opacity-100 data-[state=checked]:opacity-100 transition-opacity"}
              />
            )}
            {/* No icon tile and no type badge: the design's table is four
                columns of text, and the TYPE column already says what a row
                is. A tinted square and a pill on every row is the enclosure
                this was asked to lose. */}
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-semibold">{resource.title}</p>
              {resource.description && (
                <p className="truncate text-[13px] text-muted-foreground">{resource.description}</p>
              )}
            </div>
            <span className="hidden w-[110px] shrink-0 text-[12.5px] uppercase tracking-[0.08em] text-muted-foreground sm:block">
              {resource.resource_type}
            </span>
            <span className="hidden w-[120px] shrink-0 text-[13px] text-muted-foreground md:block">
              {formatFileSize((resource as any).file_size)}
            </span>
            <span className="hidden w-[110px] shrink-0 text-right text-[13px] text-muted-foreground lg:block">
              {formatWhen(resource.updated_at)}
            </span>
            {/* The row's controls sit over the last columns on hover rather
                than taking a column of their own, so the four columns stay
                aligned with the header across every row. */}
            <div className="absolute right-1 flex items-center gap-0.5 bg-accent pl-3 opacity-0 shadow-[-12px_0_12px_-6px_hsl(var(--accent))] transition-opacity group-hover:opacity-100 focus-within:opacity-100">
              <Button variant="ghost" size="icon" className="h-7 w-7"
                onClick={(e) => { e.stopPropagation(); toggleBookmark.mutate(); }}
                title={isBookmarked ? "Remove bookmark" : "Bookmark"}>
                <Bookmark className={`h-3.5 w-3.5 ${isBookmarked ? "fill-current text-rule" : ""}`} />
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
      {canManage && <EditResourceDialog resource={resource} open={editOpen} onOpenChange={setEditOpen} />}
    </>
  );
}

/* ---------- Folder Row ---------- */

interface FolderRowProps extends BaseRowProps {
  folder: Tables<"resource_folders">;
  count: number;
  /** Whether there is anything inside worth revealing. */
  hasChildren?: boolean;
  expanded?: boolean;
  onToggleExpanded?: () => void;
  onNewSubfolder?: () => void;
  onOpen: () => void;
  onRename: () => void;
  onDelete: () => void;
  onDownload: () => void;
  downloading?: boolean;
}

export function FolderRow({
  folder, selected, onClick, canManage, selectMode, count, onOpen, onRename, onDelete, onDownload,
  downloading, isDropTarget, depth = 0, hasChildren = false, expanded = false,
  onToggleExpanded, onNewSubfolder,
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
    // Padding rather than margin: the row keeps its full width, so its hover
    // fill and its bottom rule still run the whole way across the list. An
    // indented margin would leave a ragged left edge on every nested row.
    paddingLeft: depth ? `${4 + depth * INDENT_PX}px` : undefined,
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
          onDoubleClick={(e) => { e.stopPropagation(); if (!selectMode) onOpen(); }}
          className={`group relative flex cursor-pointer select-none items-center gap-4 border-b border-border px-1 py-3 transition-colors
            ${active ? "bg-accent-strong ring-2 ring-inset ring-rule" : selected ? "bg-accent-strong" : "hover:bg-accent"}
          `}
        >
          {(canManage || selectMode) && (
            <Checkbox
              checked={selected}
              onClick={(e) => e.stopPropagation()}
              onCheckedChange={() => onClick({ shiftKey: false, metaKey: true, ctrlKey: false, stopPropagation() {}, preventDefault() {} } as any)}
              className={selectMode
                ? "shrink-0"
                : "opacity-0 group-hover:opacity-100 data-[state=checked]:opacity-100 transition-opacity"}
            />
          )}
            {/* The disclosure arrow. Clicking it opens the folder *in place*,
                indented under this row; clicking the row itself still goes
                into the folder as its own view. Two ways in, and the small
                target is the one that keeps you where you are.

                It stops the click reaching the row, or every peek would also
                be a navigation. */}
            <button
              type="button"
              aria-label={expanded ? `Collapse ${folder.name}` : `Expand ${folder.name}`}
              aria-expanded={hasChildren ? expanded : undefined}
              disabled={!hasChildren}
              onClick={(e) => { e.stopPropagation(); onToggleExpanded?.(); }}
              onDoubleClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              className="-my-1 shrink-0 p-1 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-0"
            >
              <ChevronRight
                className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-90" : ""}`}
                aria-hidden
              />
            </button>
            {/* A folder keeps its icon where a file does not — it is the one
                thing in the list you can go *into*, and the TYPE column alone
                does not make that obvious enough to click. It is drawn plain,
                without the tinted tile. */}
            {active || expanded
              ? <FolderOpen className="h-4 w-4 shrink-0 text-rule" />
              : <FolderClosed className="h-4 w-4 shrink-0 text-rule" />}
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-semibold">{folder.name}</p>
            </div>
            <span className="hidden w-[110px] shrink-0 text-[12.5px] uppercase tracking-[0.08em] text-muted-foreground sm:block">
              folder
            </span>
            <span className="hidden w-[120px] shrink-0 text-[13px] text-muted-foreground md:block">
              {count} item{count === 1 ? "" : "s"}
            </span>
            <span className="hidden w-[110px] shrink-0 text-right text-[13px] text-muted-foreground lg:block">
              {formatWhen(folder.updated_at)}
            </span>
            <div className="absolute right-1 flex items-center gap-0.5 bg-accent pl-3 opacity-0 shadow-[-12px_0_12px_-6px_hsl(var(--accent))] transition-opacity group-hover:opacity-100 focus-within:opacity-100">
            <Button variant="ghost" size="icon" className="h-7 w-7"
              onClick={(e) => { e.stopPropagation(); onOpen(); }} title="Open">
              <Eye className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7"
              disabled={downloading}
              onClick={(e) => { e.stopPropagation(); onDownload(); }} title="Download folder">
              <Download className="h-3.5 w-3.5" />
            </Button>
            {canManage && onNewSubfolder && (
              <Button variant="ghost" size="icon" className="h-7 w-7"
                onClick={(e) => { e.stopPropagation(); onNewSubfolder(); }} title="New folder inside">
                <FolderPlus className="h-3.5 w-3.5" />
              </Button>
            )}
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
