import { useState, useMemo, useRef } from "react";
import {
  DndContext, DragOverlay, KeyboardSensor, PointerSensor, pointerWithin,
  rectIntersection, useSensor, useSensors, useDroppable,
  type CollisionDetection, type DragEndEvent, type DragOverEvent, type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import {
  ChevronRight, FolderPlus, ListPlus, Upload, Plus, X, Trash2, Download,
  FolderInput, CheckSquare, FolderClosed, FileText, MoreVertical, ArrowLeft,
} from "lucide-react";
import { toast } from "sonner";
import { FileRow, FolderRow } from "@/components/drive/DriveRow";
import { FileDropOverlay } from "@/components/FileDropOverlay";
import { UploadProgressBar } from "@/components/UploadProgressBar";
import { AddResourceDialog } from "@/components/AddResourceDialog";
import { downloadResourcesAsZip } from "@/lib/resourceDownloads";
import type { Tables } from "@/integrations/supabase/types";

const UNGROUPED = "__ungrouped__";

interface DriveBrowserProps {
  subsection: Tables<"subsections">;
  specialtyId: string;
  resources: Tables<"resources">[];
  folders: Tables<"resource_folders">[];
  canManage: boolean;
}

interface DragItem {
  type: "file" | "folder";
  id: string;
}

const collisionDetection: CollisionDetection = (args) => {
  const pw = pointerWithin(args);
  if (pw.length > 0) return pw;
  return rectIntersection(args);
};

/** Droppable empty zone (subheading section, root, breadcrumb) */
function DropZone({
  id, children, className = "", activeId, fallbackLabel,
}: {
  id: string;
  children?: React.ReactNode;
  className?: string;
  activeId?: string | null;
  fallbackLabel?: string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  const active = isOver || activeId === id;
  return (
    <div ref={setNodeRef}
      className={`relative rounded-md transition-colors ${active ? "bg-accent/10 ring-1 ring-accent/40" : ""} ${className}`}>
      {children}
      {active && !children && (
        <div className="flex items-center justify-center py-6 text-xs text-accent">
          {fallbackLabel ?? "Drop to move here"}
        </div>
      )}
    </div>
  );
}

export function DriveBrowser({
  subsection, specialtyId, resources, folders, canManage,
}: DriveBrowserProps) {
  const queryClient = useQueryClient();

  /* ---------- Local state ---------- */
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [manualSubheadings, setManualSubheadings] = useState<string[]>([]);
  const [selection, setSelection] = useState<Set<string>>(new Set()); // ids of selected items (files or `folder-row:id`)
  const [lastClickedId, setLastClickedId] = useState<string | null>(null);

  const [activeDrag, setActiveDrag] = useState<DragItem | null>(null);
  const [activeDropId, setActiveDropId] = useState<string | null>(null);

  const [nativeDropping, setNativeDropping] = useState(false);
  const [nativeDropCount, setNativeDropCount] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0, fileName: "" });

  const [renameFolderId, setRenameFolderId] = useState<string | null>(null);
  const [renameFolderName, setRenameFolderName] = useState("");
  const [deleteFolderId, setDeleteFolderId] = useState<string | null>(null);

  const [addFolderOpen, setAddFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");

  const [addSubheadingOpen, setAddSubheadingOpen] = useState(false);
  const [newSubheading, setNewSubheading] = useState("");

  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [moveTargetIds, setMoveTargetIds] = useState<string[]>([]);

  const [bulkDownloading, setBulkDownloading] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor)
  );

  /* ---------- Derived data ---------- */
  const currentFolder = useMemo(
    () => folders.find((f) => f.id === currentFolderId) ?? null,
    [folders, currentFolderId]
  );

  // Auto-detected subheadings from data
  const detectedSubheadings = useMemo(() => {
    const s = new Set<string>();
    resources.forEach((r) => { const sh = (r as any).subheading; if (sh) s.add(sh); });
    folders.forEach((f) => { const sh = (f as any).subheading; if (sh) s.add(sh); });
    return [...s];
  }, [resources, folders]);

  const allSubheadings = useMemo(
    () => [...new Set([...detectedSubheadings, ...manualSubheadings])],
    [detectedSubheadings, manualSubheadings]
  );

  /* ---------- Selection helpers ---------- */
  const visibleIds: string[] = useMemo(() => {
    if (currentFolder) {
      return resources
        .filter((r) => (r as any).folder_id === currentFolder.id)
        .map((r) => r.id);
    }
    const ids: string[] = [];
    folders.forEach((f) => ids.push(`folder-row:${f.id}`));
    resources.filter((r) => !(r as any).folder_id).forEach((r) => ids.push(r.id));
    return ids;
  }, [resources, folders, currentFolder]);

  const handleRowClick = (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    if (e.shiftKey && lastClickedId) {
      const a = visibleIds.indexOf(lastClickedId);
      const b = visibleIds.indexOf(id);
      if (a !== -1 && b !== -1) {
        const [lo, hi] = [Math.min(a, b), Math.max(a, b)];
        const next = new Set(selection);
        visibleIds.slice(lo, hi + 1).forEach((v) => next.add(v));
        setSelection(next);
        return;
      }
    }
    if (e.metaKey || e.ctrlKey) {
      const next = new Set(selection);
      if (next.has(id)) next.delete(id); else next.add(id);
      setSelection(next);
      setLastClickedId(id);
      return;
    }
    // Once selection mode is active, plain clicks add/remove items instead of clearing.
    if (selection.size > 0) {
      const next = new Set(selection);
      if (next.has(id)) next.delete(id); else next.add(id);
      setSelection(next);
      setLastClickedId(id);
      return;
    }
    setSelection(new Set([id]));
    setLastClickedId(id);
  };

  const clearSelection = () => setSelection(new Set());

  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selection.has(id));

  const selectedFiles = useMemo(
    () => resources.filter((r) => selection.has(r.id)),
    [resources, selection]
  );
  const selectedFolders = useMemo(
    () => folders.filter((f) => selection.has(`folder-row:${f.id}`)),
    [folders, selection]
  );

  /* ---------- Mutations ---------- */
  const updateResourcePlacement = useMutation({
    mutationFn: async (vars: { id: string; folder_id: string | null; subheading: string | null; sort_order?: number }) => {
      const upd: any = { folder_id: vars.folder_id, subheading: vars.subheading };
      if (vars.sort_order !== undefined) upd.sort_order = vars.sort_order;
      const { error } = await supabase.from("resources").update(upd).eq("id", vars.id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["resources"] }),
  });

  const updateFolder = useMutation({
    mutationFn: async (vars: { id: string; subheading?: string | null; name?: string; sort_order?: number }) => {
      const upd: any = {};
      if (vars.subheading !== undefined) upd.subheading = vars.subheading;
      if (vars.name !== undefined) upd.name = vars.name;
      if (vars.sort_order !== undefined) upd.sort_order = vars.sort_order;
      const { error } = await supabase.from("resource_folders").update(upd).eq("id", vars.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["resource-folders"] });
      queryClient.invalidateQueries({ queryKey: ["resources"] });
    },
  });

  const deleteResource = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("resources").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["resources"] }),
  });

  const deleteFolder = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("resources").delete().eq("folder_id", id);
      const { error } = await supabase.from("resource_folders").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["resources"] });
      queryClient.invalidateQueries({ queryKey: ["resource-folders"] });
    },
  });

  const createFolder = useMutation({
    mutationFn: async (vars: { name: string; subheading: string | null }) => {
      const { data: existing } = await supabase
        .from("resource_folders").select("name,sort_order")
        .eq("subsection_id", subsection.id);
      const taken = new Set(((existing as any) ?? []).map((r: any) => r.name as string));
      let unique = vars.name; let n = 2;
      while (taken.has(unique)) unique = `${vars.name} (${n++})`;
      const maxOrder = Math.max(-1, ...((existing as any) ?? []).map((r: any) => r.sort_order ?? 0));
      const { error } = await supabase.from("resource_folders").insert({
        name: unique, subsection_id: subsection.id,
        subheading: vars.subheading, sort_order: maxOrder + 1,
      } as any);
      if (error) throw error;
      return unique;
    },
    onSuccess: (name) => {
      toast.success(`Folder "${name}" created`);
      queryClient.invalidateQueries({ queryKey: ["resource-folders"] });
      setAddFolderOpen(false); setNewFolderName("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  /* ---------- Apply moves (drag drop) ---------- */
  const moveItemsToTarget = async (
    items: { fileIds: string[]; folderIds: string[] },
    target: { folderId: string | null; subheading: string | null }
  ) => {
    try {
      // Compute next sort order in destination
      const destResources = target.folderId
        ? resources.filter((r) => (r as any).folder_id === target.folderId)
        : resources.filter((r) => !(r as any).folder_id && ((r as any).subheading ?? null) === target.subheading);
      let nextOrder = Math.max(-1, ...destResources.map((r) => r.sort_order ?? 0)) + 1;

      for (const fid of items.fileIds) {
        // Don't move a file into the same place
        const r = resources.find((x) => x.id === fid);
        if (!r) continue;
        if ((r as any).folder_id === target.folderId
          && (((r as any).subheading ?? null) === target.subheading)) continue;
        await updateResourcePlacement.mutateAsync({
          id: fid, folder_id: target.folderId, subheading: target.subheading,
          sort_order: nextOrder++,
        });
      }
      // Folders can only be moved between subheadings (not into another folder)
      for (const fid of items.folderIds) {
        if (target.folderId) continue; // can't nest folders
        const f = folders.find((x) => x.id === fid);
        if (!f || (f as any).subheading === target.subheading) continue;
        await updateFolder.mutateAsync({ id: fid, subheading: target.subheading });
      }
    } catch (e: any) {
      toast.error(e.message ?? "Move failed");
    }
  };

  /* ---------- Drag handlers ---------- */
  const handleDragStart = (event: DragStartEvent) => {
    const data = event.active.data.current as any;
    if (!data) return;
    const item: DragItem = data.type === "folder"
      ? { type: "folder", id: data.folderId }
      : { type: "file", id: data.resourceId };
    setActiveDrag(item);
    // If dragged item is not in selection, replace selection
    const dragSelectionId = item.type === "folder" ? `folder-row:${item.id}` : item.id;
    if (!selection.has(dragSelectionId)) {
      setSelection(new Set([dragSelectionId]));
    }
  };

  const handleDragOver = (event: DragOverEvent) => {
    setActiveDropId(event.over ? String(event.over.id) : null);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const overId = event.over ? String(event.over.id) : null;
    setActiveDrag(null);
    setActiveDropId(null);
    if (!overId) return;

    // Determine target
    let target: { folderId: string | null; subheading: string | null } | null = null;
    if (overId.startsWith("folder:")) {
      const folderId = overId.replace("folder:", "");
      const f = folders.find((x) => x.id === folderId);
      if (!f) return;
      target = { folderId, subheading: (f as any).subheading ?? null };
    } else if (overId.startsWith("sub:")) {
      const sub = overId.replace("sub:", "");
      target = { folderId: null, subheading: sub === UNGROUPED ? null : sub };
    } else if (overId === "breadcrumb-root") {
      // dropping back to section root from inside a folder -> remove folder_id
      target = { folderId: null, subheading: currentFolder ? (currentFolder as any).subheading ?? null : null };
    } else {
      return;
    }

    // Build items to move from selection (drag start already ensures dragged item is selected)
    const fileIds = [...selection].filter((id) => !id.startsWith("folder-row:"));
    const folderIds = [...selection]
      .filter((id) => id.startsWith("folder-row:"))
      .map((id) => id.replace("folder-row:", ""));
    if (!fileIds.length && !folderIds.length) return;

    await moveItemsToTarget({ fileIds, folderIds }, target);
    const total = fileIds.length + folderIds.length;
    toast.success(`Moved ${total} item${total === 1 ? "" : "s"}`);
    clearSelection();
  };

  /* ---------- Native file/folder OS upload ---------- */
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleNativeUpload = async (dataTransferOrList: DataTransfer | FileList, dest: {
    folderId: string | null; subheading: string | null;
  }) => {
    setUploading(true);
    try {
      const { getDroppedFiles, detectResourceType } = await import("@/lib/fileDropUtils");
      let dropped: { folderName: string | null; file: File }[];
      if (dataTransferOrList instanceof DataTransfer) {
        dropped = await getDroppedFiles(dataTransferOrList);
      } else {
        dropped = Array.from(dataTransferOrList).map((file) => ({ folderName: null, file }));
      }
      if (!dropped.length) return;
      const { data: { user } } = await supabase.auth.getUser();
      const { data: existing } = await supabase
        .from("resources").select("sort_order")
        .eq("subsection_id", subsection.id)
        .order("sort_order", { ascending: false }).limit(1);
      let nextOrder = ((existing?.[0]?.sort_order ?? -1) + 1);

      // Folders to auto-create (only when uploading at root, not inside a folder)
      const folderIdMap: Record<string, string> = {};
      if (!dest.folderId) {
        const folderNames = [...new Set(dropped.map((d) => d.folderName).filter(Boolean))] as string[];
        const { data: siblings } = await supabase
          .from("resource_folders").select("name").eq("subsection_id", subsection.id);
        const taken = new Set(((siblings as any) ?? []).map((r: any) => r.name as string));
        for (const fname of folderNames) {
          let unique = fname; let n = 2;
          while (taken.has(unique)) unique = `${fname} (${n++})`;
          taken.add(unique);
          const { data: fd, error: fe } = await supabase.from("resource_folders").insert({
            name: unique, subsection_id: subsection.id,
            subheading: dest.subheading, sort_order: 0,
          } as any).select("id").single();
          if (fe) { toast.error(`Folder failed: ${unique}`); continue; }
          folderIdMap[fname] = (fd as any).id;
        }
      }

      setUploadProgress({ current: 0, total: dropped.length, fileName: "" });
      for (let i = 0; i < dropped.length; i++) {
        const { folderName, file } = dropped[i];
        setUploadProgress({ current: i + 1, total: dropped.length, fileName: file.name });
        const ext = file.name.split(".").pop();
        const path = `${specialtyId}/${subsection.id}/${crypto.randomUUID()}.${ext}`;
        const { error: ue } = await supabase.storage.from("resources").upload(path, file);
        if (ue) { toast.error(`Failed: ${file.name}`); continue; }
        const targetFolderId = dest.folderId ?? (folderName ? folderIdMap[folderName] ?? null : null);
        await supabase.from("resources").insert({
          title: file.name.replace(/\.[^.]+$/, ""),
          resource_type: detectResourceType(file) as any,
          subsection_id: subsection.id,
          file_url: path,
          added_by: user?.id ?? null,
          sort_order: nextOrder++,
          folder_id: targetFolderId,
          subheading: targetFolderId ? null : dest.subheading,
          file_size: file.size,
        } as any);
      }
      toast.success(`Uploaded ${dropped.length} file${dropped.length === 1 ? "" : "s"}`);
      queryClient.invalidateQueries({ queryKey: ["resources"] });
      queryClient.invalidateQueries({ queryKey: ["resource-folders"] });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setUploading(false);
      setNativeDropping(false);
      setNativeDropCount(0);
    }
  };

  /* ---------- Bulk actions ---------- */
  const handleBulkDownload = async () => {
    setBulkDownloading(true);
    try {
      const files: { resource: Tables<"resources">; folderName?: string | null }[] = [];
      for (const f of selectedFolders) {
        const folderRes = resources.filter((r) => (r as any).folder_id === f.id);
        for (const r of folderRes) files.push({ resource: r, folderName: f.name });
      }
      for (const r of selectedFiles) {
        if (!(r as any).folder_id || !selectedFolders.find((f) => f.id === (r as any).folder_id)) {
          files.push({ resource: r, folderName: null });
        }
      }
      if (!files.length) { toast.error("Nothing downloadable selected"); return; }
      const { downloaded, skippedCount } = await downloadResourcesAsZip(
        files, `${subsection.name}-${new Date().toISOString().slice(0, 10)}`,
      );
      toast.success(skippedCount ? `${downloaded} downloaded, ${skippedCount} skipped` : `${downloaded} downloaded`);
    } catch (e: any) {
      toast.error(e.message ?? "Download failed");
    } finally {
      setBulkDownloading(false);
    }
  };

  const handleBulkDelete = async () => {
    setBulkDeleting(true);
    try {
      for (const f of selectedFolders) {
        await deleteFolder.mutateAsync(f.id);
      }
      for (const r of selectedFiles) {
        if (!(r as any).folder_id || !selectedFolders.find((f) => f.id === (r as any).folder_id)) {
          await deleteResource.mutateAsync(r.id);
        }
      }
      toast.success("Deleted");
      clearSelection();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBulkDeleting(false);
    }
  };

  const handleBulkMove = async (target: { folderId: string | null; subheading: string | null }) => {
    const fileIds = selectedFiles.map((r) => r.id);
    const folderIds = selectedFolders.map((f) => f.id);
    await moveItemsToTarget({ fileIds, folderIds }, target);
    toast.success("Moved");
    setMoveDialogOpen(false);
    clearSelection();
  };

  const handleDownloadFolder = async (folder: Tables<"resource_folders">) => {
    const folderRes = resources.filter((r) => (r as any).folder_id === folder.id);
    if (!folderRes.length) { toast.info("Folder is empty"); return; }
    const { downloaded, skippedCount } = await downloadResourcesAsZip(
      folderRes.map((resource) => ({ resource })), folder.name,
    );
    toast.success(skippedCount ? `${downloaded} downloaded, ${skippedCount} skipped` : `${downloaded} downloaded`);
  };

  /* ---------- Renderers ---------- */
  const renderRoot = () => {
    const ungroupedFolders = folders.filter((f) => !(f as any).subheading);
    const ungroupedFiles = resources
      .filter((r) => !(r as any).folder_id && !(r as any).subheading)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

    const groups = allSubheadings.map((sh) => ({
      name: sh,
      folders: folders.filter((f) => (f as any).subheading === sh),
      files: resources
        .filter((r) => !(r as any).folder_id && (r as any).subheading === sh)
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
    }));

    return (
      <div className="space-y-5">
        <Section
          id={`sub:${UNGROUPED}`}
          label={null}
          activeDropId={activeDropId}
          empty={ungroupedFolders.length === 0 && ungroupedFiles.length === 0}
        >
          {ungroupedFolders.map((f) => (
            <FolderRow
              key={f.id}
              folder={f}
              count={resources.filter((r) => (r as any).folder_id === f.id).length}
              selected={selection.has(`folder-row:${f.id}`)}
              onClick={(e) => {
                if (e.shiftKey || e.metaKey || e.ctrlKey) { handleRowClick(`folder-row:${f.id}`, e); return; }
                if (selection.size > 0) { handleRowClick(`folder-row:${f.id}`, e); return; }
                setCurrentFolderId(f.id); clearSelection();
              }}
              canManage={canManage}
              onOpen={() => { setCurrentFolderId(f.id); clearSelection(); }}
              onRename={() => { setRenameFolderId(f.id); setRenameFolderName(f.name); }}
              onDelete={() => setDeleteFolderId(f.id)}
              onDownload={() => handleDownloadFolder(f)}
              isDropTarget={activeDropId === `folder:${f.id}`}
            />
          ))}
          {ungroupedFiles.map((r) => (
            <FileRow
              key={r.id} resource={r}
              selected={selection.has(r.id)}
              onClick={(e) => handleRowClick(r.id, e)}
              canManage={canManage}
              existingSubheadings={allSubheadings}
              onDelete={(id) => deleteResource.mutate(id)}
              onMove={(id) => { setMoveTargetIds([id]); setMoveDialogOpen(true); }}
              onDownload={(id) => {
                const r = resources.find((x) => x.id === id);
                if (!r) return;
                downloadResourcesAsZip([{ resource: r }], r.title)
                  .catch((e) => toast.error(e.message));
              }}
            />
          ))}
        </Section>

        {groups.map((g) => (
          <div key={g.name} className="space-y-1.5">
            <DropZone id={`sub:${g.name}`} activeId={activeDropId}>
              <div className="flex items-center gap-2 px-2 py-1 sticky top-0 z-10 bg-background/95 backdrop-blur-sm">
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground rotate-90" />
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {g.name}
                </h4>
                <Badge variant="secondary" className="text-[10px]">
                  {g.folders.length + g.files.length}
                </Badge>
              </div>
            </DropZone>
            <Section
              id={`sub:${g.name}`}
              label={g.name}
              activeDropId={activeDropId}
              empty={g.folders.length === 0 && g.files.length === 0}
            >
              {g.folders.map((f) => (
                <FolderRow
                  key={f.id}
                  folder={f}
                  count={resources.filter((r) => (r as any).folder_id === f.id).length}
                  selected={selection.has(`folder-row:${f.id}`)}
                  onClick={(e) => {
                    if (e.shiftKey || e.metaKey || e.ctrlKey) { handleRowClick(`folder-row:${f.id}`, e); return; }
                    if (selection.size > 0) { handleRowClick(`folder-row:${f.id}`, e); return; }
                    setCurrentFolderId(f.id); clearSelection();
                  }}
                  canManage={canManage}
                  onOpen={() => { setCurrentFolderId(f.id); clearSelection(); }}
                  onRename={() => { setRenameFolderId(f.id); setRenameFolderName(f.name); }}
                  onDelete={() => setDeleteFolderId(f.id)}
                  onDownload={() => handleDownloadFolder(f)}
                  isDropTarget={activeDropId === `folder:${f.id}`}
                />
              ))}
              {g.files.map((r) => (
                <FileRow
                  key={r.id} resource={r}
                  selected={selection.has(r.id)}
                  onClick={(e) => handleRowClick(r.id, e)}
                  canManage={canManage}
                  existingSubheadings={allSubheadings}
                  onDelete={(id) => deleteResource.mutate(id)}
                  onMove={(id) => { setMoveTargetIds([id]); setMoveDialogOpen(true); }}
                  onDownload={(id) => {
                    const r = resources.find((x) => x.id === id);
                    if (!r) return;
                    downloadResourcesAsZip([{ resource: r }], r.title)
                      .catch((e) => toast.error(e.message));
                  }}
                />
              ))}
            </Section>
          </div>
        ))}
      </div>
    );
  };

  const renderFolderView = () => {
    if (!currentFolder) return null;
    const folderRes = resources
      .filter((r) => (r as any).folder_id === currentFolder.id)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    return (
      <Section
        id={`folder:${currentFolder.id}`}
        label={currentFolder.name}
        activeDropId={activeDropId}
        empty={folderRes.length === 0}
      >
        {folderRes.map((r) => (
          <FileRow
            key={r.id} resource={r}
            selected={selection.has(r.id)}
            onClick={(e) => handleRowClick(r.id, e)}
            canManage={canManage}
            existingSubheadings={allSubheadings}
            onDelete={(id) => deleteResource.mutate(id)}
            onMove={(id) => { setMoveTargetIds([id]); setMoveDialogOpen(true); }}
            onDownload={(id) => {
              const r = resources.find((x) => x.id === id);
              if (!r) return;
              downloadResourcesAsZip([{ resource: r }], r.title)
                .catch((e) => toast.error(e.message));
            }}
          />
        ))}
      </Section>
    );
  };

  // dnd sortable id list (must include all draggable ids visible)
  const sortableIds = useMemo(() => {
    if (currentFolder) return resources.filter((r) => (r as any).folder_id === currentFolder.id).map((r) => r.id);
    const ids: string[] = [];
    folders.forEach((f) => ids.push(`folder-row:${f.id}`));
    resources.filter((r) => !(r as any).folder_id).forEach((r) => ids.push(r.id));
    return ids;
  }, [currentFolder, resources, folders]);

  const selectedCount = selection.size;
  const folderDeleteData = deleteFolderId ? folders.find((f) => f.id === deleteFolderId) : null;
  const folderDeleteCount = deleteFolderId
    ? resources.filter((r) => (r as any).folder_id === deleteFolderId).length : 0;

  /* ---------- Render ---------- */
  return (
    <div
      className="relative space-y-3 rounded-lg border bg-card/30 p-3"
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        if (!nativeDropping) {
          setNativeDropping(true);
          setNativeDropCount(e.dataTransfer.items?.length ?? 0);
        }
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          setNativeDropping(false);
          setNativeDropCount(0);
        }
      }}
      onDrop={(e) => {
        if (!e.dataTransfer.files?.length) return;
        e.preventDefault();
        e.stopPropagation();
        handleNativeUpload(e.dataTransfer, {
          folderId: currentFolder?.id ?? null,
          subheading: currentFolder ? (currentFolder as any).subheading ?? null : null,
        });
      }}
    >
      <FileDropOverlay
        active={nativeDropping}
        itemCount={nativeDropCount}
        label={currentFolder ? `Drop into "${currentFolder.name}"` : `Drop into ${subsection.name}`}
      />

      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        {currentFolder && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 text-xs -ml-2"
            onClick={() => { setCurrentFolderId(null); clearSelection(); }}
            aria-label="Back to previous view"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back
          </Button>
        )}
        <Breadcrumb
          subsectionName={subsection.name}
          currentFolderName={currentFolder?.name ?? null}
          onClickRoot={() => { setCurrentFolderId(null); clearSelection(); }}
          activeDropId={activeDropId}
        />
        <div className="ml-auto flex items-center gap-1.5 flex-wrap">
          {visibleIds.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={() =>
                allVisibleSelected ? clearSelection() : setSelection(new Set(visibleIds))
              }
            >
              <CheckSquare className="h-3.5 w-3.5" />
              {allVisibleSelected ? "Deselect all" : "Select all"}
            </Button>
          )}
          {canManage && (
            <>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" className="h-8 gap-1.5 text-xs">
                    <Plus className="h-3.5 w-3.5" /> New
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>Add to {currentFolder?.name ?? subsection.name}</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => fileInputRef.current?.click()}>
                    <Upload className="h-3.5 w-3.5 mr-2" /> Upload files
                  </DropdownMenuItem>
                  {!currentFolder && (
                    <DropdownMenuItem onClick={() => setAddFolderOpen(true)}>
                      <FolderPlus className="h-3.5 w-3.5 mr-2" /> New folder
                    </DropdownMenuItem>
                  )}
                  {!currentFolder && (
                    <DropdownMenuItem onClick={() => setAddSubheadingOpen(true)}>
                      <ListPlus className="h-3.5 w-3.5 mr-2" /> New subheading
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
              <AddResourceDialog
                subsectionId={subsection.id}
                specialtyId={specialtyId}
                existingSubheadings={allSubheadings}
              />
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.length) {
                    handleNativeUpload(e.target.files, {
                      folderId: currentFolder?.id ?? null,
                      subheading: currentFolder ? (currentFolder as any).subheading ?? null : null,
                    });
                  }
                  e.target.value = "";
                }}
              />
            </>
          )}
        </div>
      </div>

      {uploading && uploadProgress.total > 0 && (
        <UploadProgressBar
          current={uploadProgress.current}
          total={uploadProgress.total}
          currentFileName={uploadProgress.fileName}
        />
      )}

      {/* List header */}
      <div className="hidden md:flex items-center gap-3 px-3 text-[11px] uppercase tracking-wide text-muted-foreground/70 border-b pb-1.5">
        <div className="w-8" />
        <div className="flex-1">Name</div>
        <div className="hidden sm:block w-14" />
        <div className="w-20 text-right">Size</div>
        <div className="w-32" />
      </div>

      {/* Body */}
      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={() => { setActiveDrag(null); setActiveDropId(null); }}
      >
        <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
          {currentFolder ? renderFolderView() : renderRoot()}
        </SortableContext>
        <DragOverlay dropAnimation={null}>
          {activeDrag ? (
            <DragPreview
              count={selection.size > 1 ? selection.size : 1}
              label={
                activeDrag.type === "folder"
                  ? folders.find((f) => f.id === activeDrag.id)?.name ?? "Folder"
                  : resources.find((r) => r.id === activeDrag.id)?.title ?? "File"
              }
              kind={activeDrag.type}
            />
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* Bulk action bar */}
      {selectedCount > 0 && (
        <div className="sticky bottom-3 z-30 flex items-center gap-2 rounded-xl border bg-card/95 px-3 py-2 shadow-lg backdrop-blur-sm">
          <CheckSquare className="h-4 w-4 text-accent" />
          <span className="text-sm font-medium">{selectedCount} selected</span>
          <div className="ml-auto flex items-center gap-1.5">
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs"
              onClick={handleBulkDownload} disabled={bulkDownloading}>
              <Download className="h-3.5 w-3.5" />
              {bulkDownloading ? "Downloading…" : "Download"}
            </Button>
            {canManage && (
              <>
                <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs"
                  onClick={() => setMoveDialogOpen(true)}>
                  <FolderInput className="h-3.5 w-3.5" /> Move
                </Button>
                <Button variant="destructive" size="sm" className="h-8 gap-1.5 text-xs"
                  onClick={handleBulkDelete} disabled={bulkDeleting}>
                  <Trash2 className="h-3.5 w-3.5" />
                  {bulkDeleting ? "Deleting…" : "Delete"}
                </Button>
              </>
            )}
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={clearSelection}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Add folder */}
      <Dialog open={addFolderOpen} onOpenChange={setAddFolderOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>New folder</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-2">
            <div className="space-y-1.5">
              <Label>Folder name</Label>
              <Input value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)}
                autoFocus placeholder="e.g. Lecture Slides"
                onKeyDown={(e) => { if (e.key === "Enter" && newFolderName.trim()) createFolder.mutate({ name: newFolderName.trim(), subheading: null }); }} />
            </div>
            <Button className="w-full" disabled={!newFolderName.trim() || createFolder.isPending}
              onClick={() => createFolder.mutate({ name: newFolderName.trim(), subheading: null })}>
              {createFolder.isPending ? "Creating…" : "Create folder"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add subheading */}
      <Dialog open={addSubheadingOpen} onOpenChange={setAddSubheadingOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>New subheading</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-2">
            <div className="space-y-1.5">
              <Label>Subheading name</Label>
              <Input value={newSubheading} onChange={(e) => setNewSubheading(e.target.value)}
                autoFocus placeholder="e.g. Core Curriculum" />
            </div>
            <Button className="w-full" disabled={!newSubheading.trim()}
              onClick={() => {
                setManualSubheadings((prev) => [...prev, newSubheading.trim()]);
                toast.success("Subheading added");
                setAddSubheadingOpen(false); setNewSubheading("");
              }}>Add subheading</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Rename folder */}
      <Dialog open={!!renameFolderId} onOpenChange={(o) => { if (!o) { setRenameFolderId(null); setRenameFolderName(""); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Rename folder</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-2">
            <Input value={renameFolderName} onChange={(e) => setRenameFolderName(e.target.value)} autoFocus />
            <Button className="w-full"
              disabled={!renameFolderName.trim()}
              onClick={() => {
                if (!renameFolderId) return;
                updateFolder.mutate({ id: renameFolderId, name: renameFolderName.trim() });
                setRenameFolderId(null);
              }}>Save</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete folder */}
      <Dialog open={!!deleteFolderId} onOpenChange={(o) => { if (!o) setDeleteFolderId(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete "{folderDeleteData?.name}"?</DialogTitle>
            <DialogDescription>
              {folderDeleteCount > 0
                ? `This folder contains ${folderDeleteCount} item${folderDeleteCount === 1 ? "" : "s"}. Deleting will permanently remove the folder and its contents.`
                : "This empty folder will be removed."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDeleteFolderId(null)}>Cancel</Button>
            <Button variant="destructive"
              disabled={deleteFolder.isPending}
              onClick={() => {
                if (!deleteFolderId) return;
                deleteFolder.mutate(deleteFolderId, {
                  onSuccess: () => { setDeleteFolderId(null); toast.success("Folder deleted"); }
                });
              }}>
              {deleteFolder.isPending ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Move dialog */}
      <Dialog open={moveDialogOpen} onOpenChange={setMoveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Move {moveTargetIds.length || selectedCount} item{(moveTargetIds.length || selectedCount) === 1 ? "" : "s"}</DialogTitle>
            <DialogDescription>Choose a destination folder or subheading.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1 max-h-72 overflow-y-auto">
            <button
              className="w-full flex items-center gap-2 px-3 py-2 rounded-md hover:bg-secondary text-left text-sm"
              onClick={() => {
                const fileIds = moveTargetIds.length ? moveTargetIds : selectedFiles.map((r) => r.id);
                const folderIds = moveTargetIds.length ? [] : selectedFolders.map((f) => f.id);
                moveItemsToTarget({ fileIds, folderIds }, { folderId: null, subheading: null })
                  .then(() => { toast.success("Moved"); setMoveDialogOpen(false); setMoveTargetIds([]); clearSelection(); });
              }}>
              <FileText className="h-4 w-4" /> Ungrouped (top of section)
            </button>
            {allSubheadings.map((sh) => (
              <button key={`sh-${sh}`}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-md hover:bg-secondary text-left text-sm"
                onClick={() => {
                  const fileIds = moveTargetIds.length ? moveTargetIds : selectedFiles.map((r) => r.id);
                  const folderIds = moveTargetIds.length ? [] : selectedFolders.map((f) => f.id);
                  moveItemsToTarget({ fileIds, folderIds }, { folderId: null, subheading: sh })
                    .then(() => { toast.success("Moved"); setMoveDialogOpen(false); setMoveTargetIds([]); clearSelection(); });
                }}>
                <ChevronRight className="h-4 w-4" /> {sh}
              </button>
            ))}
            {folders.map((f) => (
              <button key={f.id}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-md hover:bg-secondary text-left text-sm"
                onClick={() => {
                  const fileIds = moveTargetIds.length ? moveTargetIds : selectedFiles.map((r) => r.id);
                  moveItemsToTarget({ fileIds, folderIds: [] }, { folderId: f.id, subheading: (f as any).subheading ?? null })
                    .then(() => { toast.success("Moved"); setMoveDialogOpen(false); setMoveTargetIds([]); clearSelection(); });
                }}>
                <FolderClosed className="h-4 w-4 text-accent" /> {f.name}
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ---------- Subcomponents ---------- */

function Section({
  id, label, children, activeDropId, empty,
}: {
  id: string;
  label: string | null;
  children?: React.ReactNode;
  activeDropId: string | null;
  empty: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  const active = isOver || activeDropId === id;

  return (
    <div
      ref={setNodeRef}
      className={`relative rounded-md p-1 min-h-[40px] transition-colors ${active ? "bg-accent/5 ring-1 ring-accent/30" : ""}`}
    >
      {empty ? (
        <div className={`flex items-center justify-center py-8 text-xs border border-dashed rounded-md ${active ? "border-accent text-accent bg-accent/5" : "border-border text-muted-foreground"}`}>
          {active ? `Drop to move here` : "Nothing here yet — drop files or use \"New\""}
        </div>
      ) : (
        <div className="space-y-1">{children}</div>
      )}
    </div>
  );
}

function Breadcrumb({
  subsectionName, currentFolderName, onClickRoot, activeDropId,
}: {
  subsectionName: string;
  currentFolderName: string | null;
  onClickRoot: () => void;
  activeDropId: string | null;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: "breadcrumb-root" });
  const active = currentFolderName && (isOver || activeDropId === "breadcrumb-root");

  return (
    <div className="flex items-center gap-1 text-sm">
      <button
        ref={currentFolderName ? setNodeRef : undefined}
        onClick={onClickRoot}
        className={`px-2 py-1 rounded-md font-medium transition-colors
          ${active ? "bg-accent/10 ring-1 ring-accent text-accent" : currentFolderName ? "text-muted-foreground hover:bg-secondary hover:text-foreground" : "text-foreground"}`}
      >
        {subsectionName}
      </button>
      {currentFolderName && (
        <>
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="px-2 py-1 font-medium">{currentFolderName}</span>
        </>
      )}
    </div>
  );
}

function DragPreview({ count, label, kind }: { count: number; label: string; kind: "file" | "folder" }) {
  return (
    <div className="pointer-events-none">
      <div className="flex items-center gap-2 rounded-lg border-2 border-accent/50 bg-card px-3 py-2 shadow-2xl ring-4 ring-accent/10 max-w-xs">
        {kind === "folder" ? <FolderClosed className="h-4 w-4 text-accent" /> : <FileText className="h-4 w-4 text-accent" />}
        <span className="truncate text-sm font-medium">{label}</span>
        {count > 1 && (
          <Badge className="ml-auto shrink-0 bg-accent text-accent-foreground">{count}</Badge>
        )}
      </div>
    </div>
  );
}
