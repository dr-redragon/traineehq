import { useState, useRef } from "react";
import { useDroppable } from "@dnd-kit/core";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  FolderOpen, FolderClosed, ChevronDown, MoreVertical, Pencil, Trash2, Upload, FileUp, Square, CheckSquare, Download,
} from "lucide-react";
import { toast } from "sonner";
import { ResourceCard } from "@/components/ResourceCard";
import { UploadProgressBar } from "@/components/UploadProgressBar";
import { FileDropOverlay } from "@/components/FileDropOverlay";
import { downloadResourcesAsZip } from "@/lib/resourceDownloads";
import type { Tables } from "@/integrations/supabase/types";

interface ResourceFolderProps {
  folder: { id: string; name: string; subsection_id: string; subheading: string | null; sort_order: number | null };
  resources: Tables<"resources">[];
  canManage: boolean;
  specialtyId: string;
  onDeleteResource: (id: string) => void;
  existingSubheadings: string[];
  selectable?: boolean;
  selectedIds?: Set<string>;
  selectedFolderIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  onToggleFolderSelect?: (folderId: string, resourceIds: string[]) => void;
  activeDropTargetId?: string | null;
}

export function ResourceFolder({
  folder,
  resources,
  canManage,
  specialtyId,
  onDeleteResource,
  existingSubheadings,
  selectable,
  selectedIds,
  selectedFolderIds,
  onToggleSelect,
  onToggleFolderSelect,
  activeDropTargetId,
}: ResourceFolderProps) {
  const queryClient = useQueryClient();
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: `folder:${folder.id}` });
  const folderDropId = `folder:${folder.id}`;
  const isActiveDropTarget = activeDropTargetId === folderDropId;
  const [open, setOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState(folder.name);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0, fileName: "" });
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [dragItemCount, setDragItemCount] = useState(0);
  const [downloading, setDownloading] = useState(false);

  const handleDownloadFolder = async () => {
    if (resources.length === 0) {
      toast.info("This folder is empty");
      return;
    }

    setDownloading(true);
    try {
      const { downloaded, skippedCount } = await downloadResourcesAsZip(
        resources.map((resource) => ({ resource })),
        folder.name,
      );

      toast.success(
        skippedCount > 0
          ? `${downloaded} file(s) downloaded, ${skippedCount} skipped`
          : `${downloaded} file(s) downloaded`,
      );
    } catch (e: any) {
      toast.error(e.message || "Unable to download this folder");
    } finally {
      setDownloading(false);
    }
  };

  const renameFolder = useMutation({
    mutationFn: async () => {
      const trimmed = newName.trim();
      if (!trimmed || trimmed === folder.name) return;
      const { error } = await supabase
        .from("resource_folders")
        .update({ name: trimmed } as any)
        .eq("id", folder.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Folder renamed");
      queryClient.invalidateQueries({ queryKey: ["resource-folders"] });
      setRenaming(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteFolder = useMutation({
    mutationFn: async () => {
      // Delete all resources inside the folder
      for (const r of resources) {
        await supabase.from("resources").delete().eq("id", r.id);
      }
      const { error } = await supabase.from("resource_folders").delete().eq("id", folder.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Folder and contents deleted");
      queryClient.invalidateQueries({ queryKey: ["resource-folders"] });
      queryClient.invalidateQueries({ queryKey: ["resources"] });
      setDeleteOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleBulkUpload = async (dataTransferOrFiles: DataTransfer | FileList) => {
    setUploading(true);
    try {
      const { getDroppedFiles, detectResourceType } = await import("@/lib/fileDropUtils");
      let filesToUpload: File[];

      if (dataTransferOrFiles instanceof DataTransfer) {
        const dropped = await getDroppedFiles(dataTransferOrFiles);
        filesToUpload = dropped.map((d) => d.file);
      } else {
        filesToUpload = Array.from(dataTransferOrFiles);
      }

      if (!filesToUpload.length) return;

      const { data: { user } } = await supabase.auth.getUser();
      const { data: existing } = await supabase
        .from("resources")
        .select("sort_order")
        .eq("subsection_id", folder.subsection_id)
        .order("sort_order", { ascending: false })
        .limit(1);
      let nextOrder = (existing?.[0]?.sort_order ?? -1) + 1;
      setUploadProgress({ current: 0, total: filesToUpload.length, fileName: "" });

      for (let i = 0; i < filesToUpload.length; i++) {
        const file = filesToUpload[i];
        setUploadProgress({ current: i + 1, total: filesToUpload.length, fileName: file.name });
        const ext = file.name.split(".").pop();
        const path = `${specialtyId}/${folder.subsection_id}/${crypto.randomUUID()}.${ext}`;
        const { error: uploadErr } = await supabase.storage.from("resources").upload(path, file);
        if (uploadErr) { toast.error(`Failed: ${file.name}`); continue; }

        const { error } = await supabase.from("resources").insert({
          title: file.name.replace(/\.[^.]+$/, ""),
          resource_type: detectResourceType(file) as any,
          subsection_id: folder.subsection_id,
          file_url: path,
          added_by: user?.id ?? null,
          sort_order: nextOrder++,
          subheading: folder.subheading,
          folder_id: folder.id,
          file_size: file.size,
        } as any);
        if (error) toast.error(`Failed: ${file.name}`);
      }
      toast.success(`${filesToUpload.length} file(s) uploaded`);
      queryClient.invalidateQueries({ queryKey: ["resources"] });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    setDragItemCount(0);
    if (e.dataTransfer.items.length > 0 || e.dataTransfer.files.length > 0) {
      handleBulkUpload(e.dataTransfer);
    }
  };

  return (
    <>
      <Collapsible open={open || isOver} onOpenChange={setOpen}>
        <Card
          ref={setDropRef}
          className={`relative transition-colors ${isActiveDropTarget || isOver ? "ring-2 ring-accent/40 bg-accent/5" : dragOver ? "ring-2 ring-accent bg-accent/5" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            if (!dragOver) {
              setDragOver(true);
              setDragItemCount(e.dataTransfer.items?.length ?? 0);
            }
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) {
              setDragOver(false);
              setDragItemCount(0);
            }
          }}
          onDrop={handleDrop}
        >
          <FileDropOverlay
            active={dragOver}
            itemCount={dragItemCount}
            compact
            label={`Drop into "${folder.name}"`}
          />
          <FileDropOverlay
            active={isActiveDropTarget && !dragOver}
            compact
            variant="move"
            label={`Move into "${folder.name}"`}
          />
          <CardContent className="p-0">
            <div className="flex items-center gap-2 px-3 py-2.5">
              {selectable && (
                <button
                  className="shrink-0 text-muted-foreground hover:text-accent"
                  onClick={(e) => { e.stopPropagation(); onToggleFolderSelect?.(folder.id, resources.map(r => r.id)); }}
                >
                  {selectedFolderIds?.has(folder.id)
                    ? <CheckSquare className="h-4 w-4 text-accent" />
                    : <Square className="h-4 w-4" />}
                </button>
              )}
              <CollapsibleTrigger asChild>
                <button className="flex items-center gap-2 flex-1 min-w-0 group">
                  <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform shrink-0 ${open ? "rotate-0" : "-rotate-90"}`} />
                  {open ? (
                    <FolderOpen className="h-4.5 w-4.5 text-accent shrink-0" />
                  ) : (
                    <FolderClosed className="h-4.5 w-4.5 text-muted-foreground group-hover:text-accent shrink-0" />
                  )}
                  {renaming ? (
                    <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                      <Input
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        className="h-7 text-sm w-40"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter") renameFolder.mutate();
                          if (e.key === "Escape") { setRenaming(false); setNewName(folder.name); }
                        }}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); renameFolder.mutate(); }}>
                        <Pencil className="h-3 w-3 text-accent" />
                      </Button>
                    </div>
                  ) : (
                    <span className="text-sm font-medium truncate group-hover:text-foreground transition-colors">
                      {folder.name}
                    </span>
                  )}
                  <span className="text-[10px] text-muted-foreground/60 shrink-0">({resources.length})</span>
                </button>
              </CollapsibleTrigger>

              {!canManage && !renaming && resources.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs gap-1 shrink-0"
                  onClick={(e) => { e.stopPropagation(); handleDownloadFolder(); }}
                  disabled={downloading}
                >
                  <Download className="h-3 w-3" />
                  {downloading ? "Downloading…" : "Download"}
                </Button>
              )}

              {canManage && !renaming && (
                <div className="flex items-center gap-0.5 shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs gap-1"
                    onClick={(e) => { e.stopPropagation(); fileRef.current?.click(); }}
                    disabled={uploading}
                  >
                    <Upload className="h-3 w-3" />
                    {uploading ? "Uploading…" : "Upload"}
                  </Button>
                  <input
                    ref={fileRef}
                    type="file"
                    multiple
                    className="hidden"
                    onChange={(e) => { if (e.target.files) handleBulkUpload(e.target.files); }}
                  />
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7">
                        <MoreVertical className="h-3.5 w-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={handleDownloadFolder} disabled={downloading || resources.length === 0}>
                        <Download className="h-3.5 w-3.5 mr-2" /> {downloading ? "Downloading…" : "Download Folder"}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => { setRenaming(true); setNewName(folder.name); }}>
                        <Pencil className="h-3.5 w-3.5 mr-2" /> Rename
                      </DropdownMenuItem>
                      <DropdownMenuItem className="text-destructive" onClick={() => setDeleteOpen(true)}>
                        <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete Folder
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )}
            </div>

            <CollapsibleContent>
              <div className="px-3 pb-3 space-y-2 border-t pt-2">
                {uploading && uploadProgress.total > 0 && (
                  <UploadProgressBar current={uploadProgress.current} total={uploadProgress.total} currentFileName={uploadProgress.fileName} />
                )}
                {resources.length === 0 ? (
                  <div className="flex items-center justify-center py-4 text-xs text-muted-foreground border border-dashed rounded-md">
                    Drop files here or click Upload
                  </div>
                ) : (
                  resources.map((r) => (
                    <ResourceCard
                      key={r.id}
                      resource={r}
                      containerId={folderDropId}
                      canManage={canManage}
                      onDelete={onDeleteResource}
                      existingSubheadings={existingSubheadings}
                      selectable={selectable}
                      selected={selectedIds?.has(r.id)}
                      onToggleSelect={onToggleSelect}
                    />
                  ))
                )}
              </div>
            </CollapsibleContent>
          </CardContent>
        </Card>
      </Collapsible>

      {/* Delete Folder Dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete "{folder.name}"</DialogTitle>
            <DialogDescription>
              {resources.length > 0
                ? `This folder has ${resources.length} resource(s). Deleting it will permanently remove the folder and all its contents.`
                : "This empty folder will be removed."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>Cancel</Button>
            <Button variant="destructive" disabled={deleteFolder.isPending} onClick={() => deleteFolder.mutate()}>
              {deleteFolder.isPending ? "Deleting…" : "Delete Folder"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
