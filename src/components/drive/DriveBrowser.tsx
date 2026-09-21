import { useState, useMemo, useRef, useEffect } from "react";
import {
  DndContext, DragOverlay, pointerWithin,
  rectIntersection, useDroppable,
  type CollisionDetection, type DragEndEvent, type DragOverEvent, type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useDragSensors } from "@/hooks/useDragSensors";
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
  ChevronRight, FolderPlus, Upload, Plus, X, Trash2, Download,
  FolderInput, CheckSquare, ListChecks, FolderClosed, FileText, MoreVertical, ArrowLeft,
  ArrowUp, ArrowDown, ChevronDown,
} from "lucide-react";
import { toast } from "sonner";
import { FileRow, FolderRow } from "@/components/drive/DriveRow";
import { FileDropOverlay } from "@/components/FileDropOverlay";
import { UploadProgressBar } from "@/components/UploadProgressBar";
import { AddResourceDialog } from "@/components/AddResourceDialog";
import { downloadResourcesAsZip } from "@/lib/resourceDownloads";
import { planReorder } from "@/lib/resourceOrdering";
import {
  ariaSortFor, nextSort, sortItems, type SortKey, type SortState,
} from "@/lib/driveSort";
import {
  canMoveFolder, collapseWithDescendants, descendantFolderIds, flattenDrive,
  folderCounts, folderPath,
} from "@/lib/folderTree";
import { uploadErrorMessage, removeStoredFiles } from "@/lib/storageUtils";
import type { Tables } from "@/integrations/supabase/types";

interface DriveBrowserProps {
  subsection: Tables<"subsections">;
  specialtyId: string;
  resources: Tables<"resources">[];
  folders: Tables<"resource_folders">[];
  canManage: boolean;
  /**
   * A folder to open on arrival, from `?folder=` in the URL.
   *
   * A folder result in the search box names a place, so following one should
   * put you inside it rather than in the section that contains it and leave
   * you to find it again.
   */
  openFolderId?: string | null;
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

export function DriveBrowser({
  subsection, specialtyId, resources, folders, canManage, openFolderId,
}: DriveBrowserProps) {
  const queryClient = useQueryClient();

  /* ---------- Local state ---------- */
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(openFolderId ?? null);
  const [selection, setSelection] = useState<Set<string>>(new Set()); // ids of selected items (files or `folder-row:id`)

  // Following a second folder result while already in the drive changes the
  // param but not the mounted component, so the state has to follow it. Only
  // when it names a folder: clearing it should leave you where you are rather
  // than throwing you back to the root mid-task.
  useEffect(() => {
    if (openFolderId) setCurrentFolderId(openFolderId);
  }, [openFolderId]);
  // Null means the hand-arranged order, which is what drag-and-drop writes and
  // what this list has always shown. A column click is a temporary view over
  // that rather than a replacement for it.
  const [sort, setSort] = useState<SortState | null>(null);

  // Which folders are open *in place*. Separate from currentFolderId, which is
  // the folder you have drilled into and are looking at on its own. A folder
  // can be expanded inline without being the one you are inside, and opening
  // one does not close the other.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [lastClickedId, setLastClickedId] = useState<string | null>(null);
  const [selectMode, setSelectMode] = useState(false); // "Select" pressed: tapping a row ticks it

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
  // Which folder the new one goes inside. Null is the section itself.
  const [newFolderParentId, setNewFolderParentId] = useState<string | null>(null);

  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [moveTargetIds, setMoveTargetIds] = useState<string[]>([]);

  const [bulkDownloading, setBulkDownloading] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  // Rows are the drag target here, so touch activates on a hold rather than on
  // movement — a swipe across a row has to stay a scroll.
  const sensors = useDragSensors(6);

  /* ---------- Derived data ---------- */
  const currentFolder = useMemo(
    () => folders.find((f) => f.id === currentFolderId) ?? null,
    [folders, currentFolderId]
  );


  /* ---------- Ordering ---------- */
  const sortFiles = (rows: Tables<"resources">[]) =>
    sortItems(
      rows.map((r) => ({
        kind: "file" as const,
        name: r.title,
        type: r.resource_type as string | null,
        size: r.file_size,
        updated: r.updated_at,
        sortOrder: r.sort_order,
        row: r,
      })),
      sort,
    ).map((i) => i.row);

  const sortFolders = (rows: Tables<"resource_folders">[]) =>
    sortItems(
      rows.map((f) => ({
        kind: "folder" as const,
        name: f.name,
        updated: f.updated_at,
        sortOrder: f.sort_order,
        row: f,
      })),
      sort,
    ).map((i) => i.row);

  /* ---------- Selection helpers ---------- */
  // Declared after `rows`, which is what it follows: "select all" and
  // shift-click mean the rows in front of you, including ones an expanded
  // folder has revealed.
  const visibleIds: string[] = [];

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
    if (selectMode || selection.size > 0) {
      const next = new Set(selection);
      if (next.has(id)) next.delete(id); else next.add(id);
      setSelection(next);
      setLastClickedId(id);
      return;
    }
    setSelection(new Set([id]));
    setLastClickedId(id);
  };

  const toggleSort = (key: SortKey) => setSort((current) => nextSort(current, key));

  const clearSelection = () => setSelection(new Set());
  const exitSelectMode = () => { setSelectMode(false); setSelection(new Set()); };

  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selection.has(id));

  const selectedFiles = useMemo(
    () => resources.filter((r) => selection.has(r.id)),
    [resources, selection]
  );
  /** The folders a pending move would carry, for working out legal targets. */
  const movingFolderIds = useMemo(
    () => (moveTargetIds.length ? [] : [...selection]
      .filter((id) => id.startsWith("folder-row:"))
      .map((id) => id.replace("folder-row:", ""))),
    [moveTargetIds, selection],
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
    mutationFn: async (vars: { id: string; parentId?: string | null; name?: string; sort_order?: number }) => {
      const upd: any = {};
      if (vars.parentId !== undefined) upd.parent_folder_id = vars.parentId;
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
      // Read the path before the row goes: afterwards there is nothing left to
      // say which object belonged to it.
      const doomed = resources.find((r) => r.id === id);
      const { error } = await supabase.from("resources").delete().eq("id", id);
      if (error) throw error;
      await removeStoredFiles([doomed?.file_url]);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["resources"] }),
  });

  const deleteFolder = useMutation({
    mutationFn: async (id: string) => {
      // A folder now has a whole branch under it. The database cascades the
      // folder rows, but the files inside them and the objects in storage are
      // this code's to clear — a cascade that deletes the rows and leaves the
      // uploads behind bills for storage nobody can reach.
      const doomedFolders = [id, ...descendantFolderIds(folders, id)];

      // Ask the database rather than the cached props: a file added by somebody
      // else since this page loaded is still the folder's to clean up.
      const { data: contents } = await supabase
        .from("resources").select("file_url").in("folder_id", doomedFolders)
        .returns<{ file_url: string | null }[]>();
      await supabase.from("resources").delete().in("folder_id", doomedFolders);
      const { error } = await supabase.from("resource_folders").delete().eq("id", id);
      if (error) throw error;
      await removeStoredFiles((contents ?? []).map((r) => r.file_url));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["resources"] });
      queryClient.invalidateQueries({ queryKey: ["resource-folders"] });
    },
  });

  const createFolder = useMutation({
    mutationFn: async (vars: { name: string; parentId: string | null }) => {
      // Uniqueness is per parent now, not per section: "Year 1" inside
      // Curriculum and "Year 1" inside Exams are two different places and both
      // should be allowed to keep the name.
      const { data: existing } = await supabase
        .from("resource_folders").select("name,sort_order,parent_folder_id")
        .eq("subsection_id", subsection.id);
      const siblings = ((existing as any) ?? [])
        .filter((r: any) => (r.parent_folder_id ?? null) === vars.parentId);
      const taken = new Set(siblings.map((r: any) => r.name as string));
      let unique = vars.name; let n = 2;
      while (taken.has(unique)) unique = `${vars.name} (${n++})`;
      const maxOrder = Math.max(-1, ...siblings.map((r: any) => r.sort_order ?? 0));
      const { error } = await supabase.from("resource_folders").insert({
        name: unique, subsection_id: subsection.id,
        parent_folder_id: vars.parentId, sort_order: maxOrder + 1,
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
    target: { folderId: string | null }
  ) => {
    try {
      const destResources = resources.filter(
        (r) => ((r as any).folder_id ?? null) === target.folderId,
      );
      let nextOrder = Math.max(-1, ...destResources.map((r) => r.sort_order ?? 0)) + 1;

      for (const fid of items.fileIds) {
        const r = resources.find((x) => x.id === fid);
        if (!r) continue;
        if (((r as any).folder_id ?? null) === target.folderId) continue;
        await updateResourcePlacement.mutateAsync({
          id: fid, folder_id: target.folderId, subheading: null,
          sort_order: nextOrder++,
        });
      }

      // Folders move into folders now. The refusals are the ones the tree
      // cannot survive: into itself, or into something it contains. The
      // database refuses both as well; catching them here means saying so
      // in words rather than surfacing a trigger's exception.
      for (const fid of items.folderIds) {
        const f = folders.find((x) => x.id === fid);
        if (!f || ((f as any).parent_folder_id ?? null) === target.folderId) continue;
        if (!canMoveFolder(folders, fid, target.folderId)) {
          toast.error(`"${f.name}" cannot go inside itself`, {
            description: "Pick a folder that is not inside the one you are moving.",
          });
          continue;
        }
        await updateFolder.mutateAsync({ id: fid, parentId: target.folderId });
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

  /**
   * A file dropped onto another file row reorders rather than moves.
   *
   * The ordering itself is worked out by planReorder, which is tested; this
   * only decides what is being dragged and applies the writes it returns.
   * Returns false when there was nothing to do, so the caller can stay quiet
   * rather than report a move that did not happen.
   */
  const reorderOntoRow = async (overResourceId: string, activeId: string) => {
    // Dropping one row onto another means "put it here", and here is only a
    // place in the hand-arranged order. While a column sort is on, the
    // positions on screen are not that order, so applying the drop would
    // silently rewrite it to match a temporary view. Drive solves this by not
    // letting you drag at all when sorted; saying so is friendlier.
    if (sort) {
      toast.info("Turn off sorting to rearrange", {
        description: "Click the highlighted column heading again to go back to the arranged order.",
      });
      return false;
    }

    // Drag the whole selection when the dragged row is part of it, matching how
    // a drop onto a group behaves; otherwise just the row under the cursor.
    const draggingIds = selection.has(activeId)
      ? [...selection].filter((id) => !id.startsWith("folder-row:"))
      : [activeId];

    const writes = planReorder(resources, draggingIds, overResourceId);
    if (!writes.length) return false;

    for (const w of writes) {
      await updateResourcePlacement.mutateAsync(w);
    }
    return true;
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const overId = event.over ? String(event.over.id) : null;
    setActiveDrag(null);
    setActiveDropId(null);
    if (!overId) return;

    // Determine target
    let target: { folderId: string | null } | null = null;
    if (overId.startsWith("folder:")) {
      const folderId = overId.replace("folder:", "");
      const f = folders.find((x) => x.id === folderId);
      if (!f) return;
      target = { folderId };
    } else if (overId.startsWith("crumb:")) {
      // Dropped on a breadcrumb: move up to that level. "crumb:root" is the
      // section itself, which is what a folder with no parent belongs to.
      const crumb = overId.replace("crumb:", "");
      target = { folderId: crumb === "root" ? null : crumb };
    } else if (overId === "section-root") {
      target = { folderId: currentFolder ? currentFolder.id : null };
    } else if (resources.some((r) => r.id === overId)) {
      // Dropped on a file row: reorder within that row's list.
      const activeId = String(event.active.id);
      if (activeId === overId) return;
      try {
        if (await reorderOntoRow(overId, activeId)) {
          clearSelection();
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Reorder failed");
      }
      return;
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
    folderId: string | null;
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
      // A dropped OS folder becomes a real folder, nested under wherever the
      // drop landed rather than only at the section root — which is what
      // dragging a folder tree from Finder or Explorer is asking for.
      const folderIdMap: Record<string, string> = {};
      {
        const folderNames = [...new Set(dropped.map((d) => d.folderName).filter(Boolean))] as string[];
        const { data: siblings } = await supabase
          .from("resource_folders").select("name,parent_folder_id")
          .eq("subsection_id", subsection.id);
        const taken = new Set(((siblings as any) ?? [])
          .filter((r: any) => (r.parent_folder_id ?? null) === dest.folderId)
          .map((r: any) => r.name as string));
        for (const fname of folderNames) {
          let unique = fname; let n = 2;
          while (taken.has(unique)) unique = `${fname} (${n++})`;
          taken.add(unique);
          const { data: fd, error: fe } = await supabase.from("resource_folders").insert({
            name: unique, subsection_id: subsection.id,
            parent_folder_id: dest.folderId, sort_order: 0,
          } as any).select("id").single();
          if (fe) { toast.error(`Folder failed: ${unique}`); continue; }
          folderIdMap[fname] = (fd as any).id;
        }
      }

      setUploadProgress({ current: 0, total: dropped.length, fileName: "" });
      let failed = 0;
      for (let i = 0; i < dropped.length; i++) {
        const { folderName, file } = dropped[i];
        setUploadProgress({ current: i + 1, total: dropped.length, fileName: file.name });
        const ext = file.name.split(".").pop();
        const path = `${specialtyId}/${subsection.id}/${crypto.randomUUID()}.${ext}`;
        const { error: ue } = await supabase.storage.from("resources").upload(path, file);
        if (ue) { failed++; toast.error(uploadErrorMessage(ue, file)); continue; }
        const targetFolderId = dest.folderId ?? (folderName ? folderIdMap[folderName] ?? null : null);
        await supabase.from("resources").insert({
          title: file.name.replace(/\.[^.]+$/, ""),
          resource_type: detectResourceType(file) as any,
          subsection_id: subsection.id,
          file_url: path,
          added_by: user?.id ?? null,
          sort_order: nextOrder++,
          folder_id: targetFolderId,
          subheading: null,
          file_size: file.size,
        } as any);
      }
      const uploaded = dropped.length - failed;
      if (uploaded > 0) toast.success(`Uploaded ${uploaded} file${uploaded === 1 ? "" : "s"}`);
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


  const handleDownloadFolder = async (folder: Tables<"resource_folders">) => {
    const folderRes = resources.filter((r) => (r as any).folder_id === folder.id);
    if (!folderRes.length) { toast.info("Folder is empty"); return; }
    const { downloaded, skippedCount } = await downloadResourcesAsZip(
      folderRes.map((resource) => ({ resource })), folder.name,
    );
    toast.success(skippedCount ? `${downloaded} downloaded, ${skippedCount} skipped` : `${downloaded} downloaded`);
  };

  /* ---------- Renderers ---------- */
  /* ---------- Renderers ---------- */

  /**
   * Every row on screen, in order, at the depth it belongs.
   *
   * There used to be two of these — one for the section root and one for the
   * inside of a folder — because a folder had exactly one level and the two
   * cases could not meet. With folders inside folders there is only one shape:
   * a list, where an expanded folder is followed by its own contents indented
   * one step further. `flattenDrive` works that out; this draws it.
   */
  const rows = flattenDrive({
    folders,
    files: resources,
    rootId: currentFolder?.id ?? null,
    expanded,
    sortFolders,
    sortFiles,
  });

  visibleIds.push(...rows.map((row) => (row.kind === "folder" ? `folder-row:${row.id}` : row.id)));

  /**
   * The destination list, drawn as the tree it is.
   *
   * A flat list of every folder was fine when folders were flat. Nested, the
   * names alone stop being enough — two "Year 1" folders in different branches
   * read identically — so the indentation is what tells them apart.
   *
   * Somewhere illegal is shown greyed rather than hidden: a folder missing
   * from the list looks like a bug, whereas one you cannot pick explains
   * itself.
   */
  const moveTargets = flattenDrive({
    folders,
    files: [],
    expanded: new Set(folders.map((f) => f.id)),
    sortFolders,
  })
    .filter((row) => row.kind === "folder")
    .map((row) => ({
      folder: row.folder!,
      depth: row.depth,
      allowed: movingFolderIds.every((id) => canMoveFolder(folders, id, row.id)),
    }));

  const runMove = (folderId: string | null) => {
    const fileIds = moveTargetIds.length ? moveTargetIds : selectedFiles.map((r) => r.id);
    const folderIds = moveTargetIds.length ? [] : selectedFolders.map((f) => f.id);
    moveItemsToTarget({ fileIds, folderIds }, { folderId }).then(() => {
      toast.success("Moved");
      setMoveDialogOpen(false);
      setMoveTargetIds([]);
      clearSelection();
    });
  };

  const toggleExpanded = (id: string) =>
    setExpanded((open) =>
      open.has(id)
        ? collapseWithDescendants(folders, open, id)
        : new Set(open).add(id),
    );

  const openFolder = (id: string) => { setCurrentFolderId(id); clearSelection(); };

  const renderRows = () => (
    <Section id="section-root" activeDropId={activeDropId} empty={rows.length === 0}>
      {rows.map((row) =>
        row.kind === "folder" ? (
          <FolderRow
            key={row.id}
            folder={row.folder!}
            depth={row.depth}
            hasChildren={!!row.hasChildren}
            expanded={!!row.expanded}
            onToggleExpanded={() => toggleExpanded(row.id)}
            count={folderCounts(folders, resources, row.id).total}
            selected={selection.has(`folder-row:${row.id}`)}
            onClick={(e) => {
              if (e.shiftKey || e.metaKey || e.ctrlKey) { handleRowClick(`folder-row:${row.id}`, e); return; }
              if (selectMode || selection.size > 0) { handleRowClick(`folder-row:${row.id}`, e); return; }
              openFolder(row.id);
            }}
            canManage={canManage}
            selectMode={selectMode}
            onOpen={() => openFolder(row.id)}
            onRename={() => { setRenameFolderId(row.id); setRenameFolderName(row.folder!.name); }}
            onDelete={() => setDeleteFolderId(row.id)}
            onDownload={() => handleDownloadFolder(row.folder!)}
            onNewSubfolder={() => { setNewFolderParentId(row.id); setAddFolderOpen(true); }}
            isDropTarget={activeDropId === `folder:${row.id}`}
          />
        ) : (
          <FileRow
            key={row.id}
            resource={row.file!}
            depth={row.depth}
            selected={selection.has(row.id)}
            onClick={(e) => handleRowClick(row.id, e)}
            canManage={canManage}
            selectMode={selectMode}
            onDelete={(id) => deleteResource.mutate(id)}
            onMove={(id) => { setMoveTargetIds([id]); setMoveDialogOpen(true); }}
            onDownload={(id) => {
              const r = resources.find((x) => x.id === id);
              if (!r) return;
              downloadResourcesAsZip([{ resource: r }], r.title)
                .catch((e) => toast.error(e.message));
            }}
          />
        ),
      )}
    </Section>
  );


  // Everything currently drawn is draggable, including rows revealed by an
  // expanded folder — so this follows the flattened list rather than being
  // worked out a second time and drifting from it.
  const sortableIds = rows.map((row) => (row.kind === "folder" ? `folder-row:${row.id}` : row.id));

  const selectedCount = selection.size;
  const folderDeleteData = deleteFolderId ? folders.find((f) => f.id === deleteFolderId) : null;
  const folderDeleteCount = deleteFolderId
    ? resources.filter((r) => (r as any).folder_id === deleteFolderId).length : 0;

  /* ---------- Render ---------- */
  return (
    <div
      className="relative space-y-2"
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
        handleNativeUpload(e.dataTransfer, { folderId: currentFolder?.id ?? null });
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
            onClick={() => {
              // Up one level, not all the way out — three folders deep, "Back"
              // meaning "the section" would throw away two steps of context.
              const trail = folderPath(folders, currentFolder?.id ?? null);
              const parent = trail.length > 1 ? trail[trail.length - 2].id : null;
              setCurrentFolderId(parent);
              clearSelection();
            }}
            aria-label="Up one level"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back
          </Button>
        )}
        <Breadcrumb
          subsectionName={subsection.name}
          path={folderPath(folders, currentFolder?.id ?? null)}
          onNavigate={(id) => { setCurrentFolderId(id); clearSelection(); }}
          activeDropId={activeDropId}
        />
        <div className="ml-auto flex items-center gap-1.5 flex-wrap">
          {visibleIds.length > 0 && (
            <Button
              variant={selectMode ? "secondary" : "outline"}
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
              aria-pressed={selectMode}
            >
              <ListChecks className="h-3.5 w-3.5" />
              {selectMode ? "Done" : "Select"}
            </Button>
          )}
          {selectMode && visibleIds.length > 0 && (
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
                  <DropdownMenuItem
                    onClick={() => { setNewFolderParentId(currentFolder?.id ?? null); setAddFolderOpen(true); }}
                  >
                    <FolderPlus className="h-3.5 w-3.5 mr-2" /> New folder
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <AddResourceDialog
                subsectionId={subsection.id}
                specialtyId={specialtyId}
              />
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.length) {
                    handleNativeUpload(e.target.files, { folderId: currentFolder?.id ?? null });
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

      {/* List header. The headings are buttons: Drive and OneDrive both sort
          from here, and these had been sitting as plain labels that looked
          exactly like something you could click. */}
      <div
        role="row"
        className="flex items-center gap-4 border-b border-foreground/30 border-t-2 border-t-border px-1 text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground"
      >
        <SortHeader sort={sort} column="name" onSort={toggleSort} className="min-w-0 flex-1">Name</SortHeader>
        <SortHeader sort={sort} column="type" onSort={toggleSort} className="hidden w-[110px] shrink-0 sm:flex">Type</SortHeader>
        <SortHeader sort={sort} column="size" onSort={toggleSort} className="hidden w-[120px] shrink-0 md:flex">Size</SortHeader>
        <SortHeader sort={sort} column="updated" onSort={toggleSort} className="hidden w-[110px] shrink-0 justify-end lg:flex">Updated</SortHeader>
      </div>

      {sort && (
        <p className="px-1 text-[12px] text-muted-foreground">
          Sorted by {sort.key === "updated" ? "date updated" : sort.key}
          {sort.dir === "asc" ? ", ascending" : ", descending"}.{" "}
          <button
            type="button"
            className="underline underline-offset-2 hover:text-foreground"
            onClick={() => setSort(null)}
          >
            Back to the arranged order
          </button>
          {canManage ? " to drag things around." : "."}
        </p>
      )}

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
          {renderRows()}
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
        <div className="sticky bottom-3 z-30 flex items-center gap-2 rounded-md border bg-card/95 px-3 py-2 shadow-lg backdrop-blur-sm">
          <CheckSquare className="h-4 w-4 text-rule" />
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
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={exitSelectMode}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Add folder */}
      <Dialog open={addFolderOpen} onOpenChange={setAddFolderOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>New folder</DialogTitle>
            <DialogDescription>
              Inside {newFolderParentId
                ? folders.find((f) => f.id === newFolderParentId)?.name ?? subsection.name
                : subsection.name}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <div className="space-y-1.5">
              <Label>Folder name</Label>
              <Input value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)}
                autoFocus placeholder="e.g. Lecture Slides"
                onKeyDown={(e) => { if (e.key === "Enter" && newFolderName.trim()) createFolder.mutate({ name: newFolderName.trim(), parentId: newFolderParentId }); }} />
            </div>
            <Button className="w-full" disabled={!newFolderName.trim() || createFolder.isPending}
              onClick={() => createFolder.mutate({ name: newFolderName.trim(), parentId: newFolderParentId })}>
              {createFolder.isPending ? "Creating…" : "Create folder"}
            </Button>
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
            <DialogDescription>Choose where they should go.</DialogDescription>
          </DialogHeader>
          <div className="max-h-72 space-y-1 overflow-y-auto">
            <button
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-secondary"
              onClick={() => runMove(null)}
            >
              <FileText className="h-4 w-4" /> {subsection.name} (top of section)
            </button>
            {moveTargets.map(({ folder, depth, allowed }) => (
              <button
                key={folder.id}
                disabled={!allowed}
                title={allowed ? undefined : "A folder cannot go inside itself"}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
                style={{ paddingLeft: `${12 + depth * 18}px` }}
                onClick={() => runMove(folder.id)}
              >
                <FolderClosed className="h-4 w-4 shrink-0 text-rule" /> {folder.name}
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ---------- Subcomponents ---------- */

/**
 * One clickable column heading.
 *
 * The arrow only appears on the column actually in use — a row of four arrows
 * would say every column is sorted. `aria-sort` carries the same fact to a
 * screen reader, which is the part a drawn arrow cannot do.
 */
function SortHeader({
  sort, column, onSort, className = "", children,
}: {
  sort: SortState | null;
  column: SortKey;
  onSort: (key: SortKey) => void;
  className?: string;
  children: React.ReactNode;
}) {
  const active = sort?.key === column;
  const Arrow = sort?.dir === "desc" ? ArrowDown : ArrowUp;
  return (
    <div role="columnheader" aria-sort={ariaSortFor(sort, column)} className={`flex ${className}`}>
      <button
        type="button"
        onClick={() => onSort(column)}
        className={`flex items-center gap-1 py-2.5 uppercase tracking-[0.12em] transition-colors hover:text-foreground ${active ? "text-foreground" : ""}`}
      >
        {children}
        {active && <Arrow className="h-3 w-3" aria-hidden />}
      </button>
    </div>
  );
}

function Section({
  id, children, activeDropId, empty,
}: {
  id: string;
  children?: React.ReactNode;
  activeDropId: string | null;
  empty: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  const active = isOver || activeDropId === id;

  return (
    <div
      ref={setNodeRef}
      className={`relative rounded-md p-1 min-h-[40px] transition-colors ${active ? "bg-accent ring-1 ring-rule" : ""}`}
    >
      {empty ? (
        <div className={`flex items-center justify-center py-8 text-xs border border-dashed rounded-md ${active ? "border-rule text-accent-deep bg-accent" : "border-border text-muted-foreground"}`}>
          {active ? `Drop to move here` : "Nothing here yet — drop files or use \"New\""}
        </div>
      ) : (
        <div className="space-y-1">{children}</div>
      )}
    </div>
  );
}

/**
 * The trail from the section down to the folder you are inside.
 *
 * It used to be one step, because a folder could only ever be one step from
 * the section. With folders inside folders it has to be the whole path, and
 * each crumb is its own drop target — dragging a file onto "Curriculum"
 * halfway along the trail moves it there, which is how you get something back
 * out of a branch you have gone too deep into.
 *
 * At the section root there is nothing to trace: the crumb would repeat the
 * heading directly above it.
 */
function Breadcrumb({
  subsectionName, path, onNavigate, activeDropId,
}: {
  subsectionName: string;
  path: { id: string; name: string }[];
  onNavigate: (folderId: string | null) => void;
  activeDropId: string | null;
}) {
  if (!path.length) return null;
  return (
    <nav aria-label="Folder path" className="flex min-w-0 flex-wrap items-center gap-1 text-sm">
      <Crumb id="root" label={subsectionName} onClick={() => onNavigate(null)} activeDropId={activeDropId} />
      {path.map((folder, index) => {
        const last = index === path.length - 1;
        return (
          <span key={folder.id} className="flex min-w-0 items-center gap-1">
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
            {last ? (
              <span className="truncate font-semibold" aria-current="page">{folder.name}</span>
            ) : (
              <Crumb id={folder.id} label={folder.name} onClick={() => onNavigate(folder.id)} activeDropId={activeDropId} />
            )}
          </span>
        );
      })}
    </nav>
  );
}

function Crumb({
  id, label, onClick, activeDropId,
}: {
  id: string;
  label: string;
  onClick: () => void;
  activeDropId: string | null;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `crumb:${id}` });
  const active = isOver || activeDropId === `crumb:${id}`;
  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={onClick}
      className={`truncate px-1 transition-colors hover:text-foreground ${active ? "bg-accent text-accent-deep" : "text-muted-foreground"}`}
    >
      {label}
    </button>
  );
}

function DragPreview({ count, label, kind }: { count: number; label: string; kind: "file" | "folder" }) {
  return (
    <div className="pointer-events-none">
      <div className="flex items-center gap-2 rounded-md border-2 border-rule bg-card px-3 py-2 shadow-2xl ring-4 ring-rule max-w-xs">
        {kind === "folder" ? <FolderClosed className="h-4 w-4 text-rule" /> : <FileText className="h-4 w-4 text-rule" />}
        <span className="truncate text-sm font-medium">{label}</span>
        {count > 1 && (
          <Badge className="ml-auto shrink-0 bg-accent text-accent-foreground">{count}</Badge>
        )}
      </div>
    </div>
  );
}
