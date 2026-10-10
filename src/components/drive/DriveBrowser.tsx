import { useState, useMemo, useRef, useEffect, useContext } from "react";
import {
  DragProvider, slotForEdge, useDropTarget,
  type DragSource, type DropEvent,
} from "@/lib/dnd";
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
  DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ChevronRight, FolderPlus, Upload, Plus, X, Trash2, Download,
  FolderInput, CheckSquare, ListChecks, FolderClosed, FileText, MoreVertical, ArrowLeft,
  ArrowUp, ArrowDown, ArrowUpDown, Copy,
} from "lucide-react";
import { toast } from "sonner";
import { FileRow, FolderRow } from "@/components/drive/DriveRow";
import { FileDropOverlay } from "@/components/FileDropOverlay";
import { UploadProgressBar } from "@/components/UploadProgressBar";
import { AddResourceDialog } from "@/components/AddResourceDialog";
import { downloadResourcesAsZip } from "@/lib/resourceDownloads";
import { planFolderReorder, planReorder } from "@/lib/resourceOrdering";
import {
  ariaSortFor, directionLabel, loadSort, nextSort, saveSort, sortItems, SORT_LABELS,
  type SortDir, type SortKey, type SortState,
} from "@/lib/driveSort";
import {
  canMoveFolder, collapseWithDescendants, descendantFolderIds, flattenDrive,
  folderCounts, folderPath,
} from "@/lib/folderTree";
import {
  uploadErrorMessage, removeStoredFiles, extractStoragePath, downloadResourceBlob,
} from "@/lib/storageUtils";
import {
  branchTopDown, copiedStoragePath, copyName, looseFiles, topLevelFolders,
} from "@/lib/driveTransfer";
import {
  DriveDragHostContext, isDriveDrag, type DriveDragHandlers,
} from "@/components/drive/dragHost";
import type { Tables } from "@/integrations/supabase/types";

interface DriveBrowserProps {
  subsection: Tables<"subsections">;
  specialtyId: string;
  resources: Tables<"resources">[];
  folders: Tables<"resource_folders">[];
  canManage: boolean;
  /**
   * Every category in the specialty, for moving and copying between them.
   * Left out, the browser only offers places inside its own category.
   */
  categories?: { id: string; name: string }[];
  /** Every category's folders, so a move to another category can pick one. */
  allFolders?: Tables<"resource_folders">[];
  /**
   * A folder to open on arrival, from `?folder=` in the URL.
   *
   * A folder result in the search box names a place, so following one should
   * put you inside it rather than in the section that contains it and leave
   * you to find it again.
   */
  openFolderId?: string | null;
  /**
   * A file or folder to pick out on arrival, from `?highlight=`. A search
   * result lands here: the row is scrolled to and marked so it can be found
   * at a glance among its neighbours.
   */
  highlightId?: string | null;
  /** Open the highlighted file as well, from `?open=1`. */
  openHighlighted?: boolean;
  /**
   * Changes on every navigation, so following the same result twice — the
   * same URL — still brings you back to it after you have wandered off.
   */
  arrivalKey?: string;
  /** Called once the highlighted file has been opened, to drop `?open=1`. */
  onOpenedHighlighted?: () => void;
}

/** A selection id for a folder. Files are stored under their own id. */
const folderRowId = (id: string) => `folder-row:${id}`;
const isFolderRowId = (id: string) => id.startsWith("folder-row:");
const folderIdOf = (rowId: string) => rowId.replace("folder-row:", "");

export function DriveBrowser({
  subsection, specialtyId, resources, folders, canManage, openFolderId,
  categories = [], allFolders = [],
  highlightId, openHighlighted, arrivalKey, onOpenedHighlighted,
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

  // The row a search result pointed at. It stays marked until you do
  // something else in the drive, so it does not vanish while you are still
  // looking for it.
  const [highlighted, setHighlighted] = useState<string | null>(highlightId ?? null);
  // Whether the highlighted row has been scrolled to (and, if asked, opened)
  // yet. It may not be on screen on the first render: the rows load after.
  const arrivedRef = useRef(false);

  // A highlight comes with its own location — the folder named alongside it,
  // or the top of the section when there is none — so the row is actually in
  // front of you, even if you had drilled somewhere else in the meantime.
  useEffect(() => {
    if (!highlightId) return;
    setCurrentFolderId(openFolderId ?? null);
    setHighlighted(highlightId);
    setSelection(new Set());
    arrivedRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightId, arrivalKey]);
  // Null means the hand-arranged order, which is what drag-and-drop writes and
  // what this list has always shown. A column click is a temporary view over
  // that rather than a replacement for it.
  // Remembered per viewer, so a chosen order follows you between categories.
  const [sort, setSortState] = useState<SortState | null>(loadSort);
  const setSort = (next: SortState | null | ((current: SortState | null) => SortState | null)) =>
    setSortState((current) => {
      const value = typeof next === "function" ? next(current) : next;
      saveSort(value);
      return value;
    });

  // Which folders are open *in place*. Separate from currentFolderId, which is
  // the folder you have drilled into and are looking at on its own. A folder
  // can be expanded inline without being the one you are inside, and opening
  // one does not close the other.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [lastClickedId, setLastClickedId] = useState<string | null>(null);
  const [selectMode, setSelectMode] = useState(false); // "Select" pressed: tapping a row ticks it


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

  // What the "Move to…" / "Copy to…" dialog is acting on. Null when it is shut.
  const [transfer, setTransfer] = useState<{
    mode: "move" | "copy";
    fileIds: string[];
    folderIds: string[];
  } | null>(null);
  // Which category the dialog is showing folders for. Starts on this one.
  const [transferCategoryId, setTransferCategoryId] = useState(subsection.id);
  const [transferring, setTransferring] = useState(false);

  const [bulkDownloading, setBulkDownloading] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

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
    setHighlighted(null);
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
  const movingFolderIds = transfer?.mode === "move" ? transfer.folderIds : [];

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
  ): Promise<number> => {
    // How many rows actually went somewhere. A drop that asks for what is
    // already true — and a press-and-release that never moved — must not
    // announce a move that did not happen.
    let moved = 0;
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
        moved += 1;
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
        moved += 1;
      }
    } catch (e: any) {
      toast.error(e.message ?? "Move failed");
    }
    return moved;
  };

  /* ---------- Moving and copying between categories ---------- */

  const categoryName = (id: string) =>
    id === subsection.id ? subsection.name : categories.find((c) => c.id === id)?.name ?? "that category";

  /**
   * What is already where something is about to land: the names a copy has to
   * avoid, and the end of each list for it to join.
   *
   * Asked of the database rather than the props, because for any category but
   * this one the props hold nothing — and for this one, somebody else may have
   * added to it since the page loaded.
   */
  const destinationContents = async (dest: { subsectionId: string; folderId: string | null }) => {
    const [{ data: folderRows }, { data: fileRows }] = await Promise.all([
      supabase.from("resource_folders").select("name,sort_order,parent_folder_id")
        .eq("subsection_id", dest.subsectionId),
      supabase.from("resources").select("title,sort_order,folder_id")
        .eq("subsection_id", dest.subsectionId),
    ]);
    const siblingsFolders = (folderRows ?? []).filter((f) => (f.parent_folder_id ?? null) === dest.folderId);
    const siblingFiles = (fileRows ?? []).filter((r) => (r.folder_id ?? null) === dest.folderId);
    return {
      folderNames: siblingsFolders.map((f) => f.name),
      fileTitles: siblingFiles.map((r) => r.title),
      nextFolderOrder: Math.max(-1, ...siblingsFolders.map((f) => f.sort_order ?? 0)) + 1,
      nextFileOrder: Math.max(-1, ...siblingFiles.map((r) => r.sort_order ?? 0)) + 1,
    };
  };

  /**
   * A move into a different category.
   *
   * A folder takes its whole branch with it. The database refuses a subfolder
   * whose category differs from its parent's, so the folders go one at a time,
   * parents first — by the time a subfolder changes category, the folder
   * holding it already has. Files inside the branch follow in one write.
   *
   * Subheadings belong to a category, so whatever moves leaves its old one
   * behind rather than pointing at a heading that does not exist over there.
   */
  const moveToCategory = async (
    items: { fileIds: string[]; folderIds: string[] },
    dest: { subsectionId: string; folderId: string | null },
  ): Promise<number> => {
    const roots = topLevelFolders(folders, items.folderIds);
    const fileIds = looseFiles(resources, folders, items.fileIds, roots);
    const place = await destinationContents(dest);
    let folderOrder = place.nextFolderOrder;
    let fileOrder = place.nextFileOrder;
    let moved = 0;

    for (const root of roots) {
      const branch = branchTopDown(folders, root);
      for (const fid of branch) {
        const upd = fid === root
          ? { subsection_id: dest.subsectionId, parent_folder_id: dest.folderId, subheading: null, sort_order: folderOrder++ }
          : { subsection_id: dest.subsectionId, subheading: null };
        const { error } = await supabase.from("resource_folders").update(upd).eq("id", fid);
        if (error) throw error;
      }
      const { error } = await supabase.from("resources")
        .update({ subsection_id: dest.subsectionId, subheading: null })
        .in("folder_id", branch);
      if (error) throw error;
      moved += 1;
    }

    for (const fid of fileIds) {
      const { error } = await supabase.from("resources").update({
        subsection_id: dest.subsectionId, folder_id: dest.folderId,
        subheading: null, sort_order: fileOrder++,
      }).eq("id", fid);
      if (error) throw error;
      moved += 1;
    }
    return moved;
  };

  /**
   * A copy of one file's row — and of its upload, if it has one.
   *
   * The upload is copied rather than shared. Deleting a resource deletes the
   * object behind it, so two rows pointing at one object would mean deleting
   * either copy quietly broke the other.
   */
  const copyResource = async (
    source: Tables<"resources">,
    dest: { subsectionId: string; folderId: string | null; title: string; sortOrder: number },
    addedBy: string | null,
  ) => {
    let fileUrl = source.file_url;
    const sourcePath = source.file_url ? extractStoragePath(source.file_url) : null;
    if (sourcePath) {
      const target = copiedStoragePath(sourcePath, specialtyId, dest.subsectionId, crypto.randomUUID());
      const bucket = supabase.storage.from("resources");
      const { error: copyError } = await bucket.copy(sourcePath, target);
      if (copyError) {
        // A server-side copy can be refused where an upload is allowed, so the
        // slow way round is the fallback: fetch it and put it back up.
        const blob = await downloadResourceBlob(source.file_url!);
        if (!blob) throw new Error(`Could not copy "${source.title}"`);
        const { error: uploadError } = await bucket.upload(target, blob);
        if (uploadError) throw new Error(`Could not copy "${source.title}": ${uploadError.message}`);
      }
      fileUrl = target;
    }
    const { error } = await supabase.from("resources").insert({
      title: dest.title,
      description: source.description,
      resource_type: source.resource_type,
      subsection_id: dest.subsectionId,
      folder_id: dest.folderId,
      subheading: dest.subsectionId === source.subsection_id && dest.folderId === source.folder_id
        ? source.subheading : null,
      file_url: fileUrl,
      external_url: source.external_url,
      embed_url: source.embed_url,
      file_size: source.file_size,
      sort_order: dest.sortOrder,
      added_by: addedBy,
    });
    if (error) {
      // The row is what makes an upload reachable; without one it is an orphan.
      if (fileUrl && fileUrl !== source.file_url) await removeStoredFiles([fileUrl]);
      throw error;
    }
  };

  /**
   * Copies of files and folders, into any folder of any category.
   *
   * A folder is copied with everything in it, branch by branch, each new
   * folder created before anything that goes inside it. Only the copies at the
   * top are renamed, and only when they would otherwise sit beside a namesake:
   * a "Notes" inside a copied folder is still "Notes".
   */
  const copyItems = async (
    items: { fileIds: string[]; folderIds: string[] },
    dest: { subsectionId: string; folderId: string | null },
  ): Promise<number> => {
    const roots = topLevelFolders(folders, items.folderIds);
    const fileIds = looseFiles(resources, folders, items.fileIds, roots);
    const { data: { user } } = await supabase.auth.getUser();
    const place = await destinationContents(dest);
    const takenFolders = [...place.folderNames];
    const takenTitles = [...place.fileTitles];
    let folderOrder = place.nextFolderOrder;
    let fileOrder = place.nextFileOrder;
    let copied = 0;

    for (const root of roots) {
      // The branch is read before anything is written, so copying a folder
      // into one of its own subfolders copies what was there, once.
      const branch = branchTopDown(folders, root);
      const newIds = new Map<string, string>();
      for (const fid of branch) {
        const f = folders.find((x) => x.id === fid);
        if (!f) continue;
        const isRoot = fid === root;
        const name = isRoot ? copyName(f.name, takenFolders) : f.name;
        if (isRoot) takenFolders.push(name);
        const parent = isRoot ? dest.folderId : newIds.get(f.parent_folder_id ?? "") ?? null;
        const { data, error } = await supabase.from("resource_folders").insert({
          name,
          subsection_id: dest.subsectionId,
          parent_folder_id: parent,
          sort_order: isRoot ? folderOrder++ : f.sort_order,
        }).select("id").single();
        if (error) throw error;
        newIds.set(fid, data.id);
      }
      for (const r of resources.filter((x) => newIds.has(x.folder_id ?? ""))) {
        await copyResource(r, {
          subsectionId: dest.subsectionId,
          folderId: newIds.get(r.folder_id!)!,
          title: r.title,
          sortOrder: r.sort_order ?? 0,
        }, user?.id ?? null);
      }
      copied += 1;
    }

    for (const fid of fileIds) {
      const r = resources.find((x) => x.id === fid);
      if (!r) continue;
      const title = copyName(r.title, takenTitles);
      takenTitles.push(title);
      await copyResource(r, {
        subsectionId: dest.subsectionId, folderId: dest.folderId, title, sortOrder: fileOrder++,
      }, user?.id ?? null);
      copied += 1;
    }
    return copied;
  };

  /**
   * The one way in for every move and copy that names a destination: the
   * dialog, a drop on a category, and "Make a copy".
   */
  const transferItems = async (
    mode: "move" | "copy",
    items: { fileIds: string[]; folderIds: string[] },
    dest: { subsectionId: string; folderId: string | null },
  ): Promise<number> => {
    setTransferring(true);
    try {
      let count: number;
      if (mode === "copy") count = await copyItems(items, dest);
      else if (dest.subsectionId === subsection.id) count = await moveItemsToTarget(items, { folderId: dest.folderId });
      else count = await moveToCategory(items, dest);

      if (count) {
        const where = dest.subsectionId === subsection.id ? "" : ` to ${categoryName(dest.subsectionId)}`;
        toast.success(`${mode === "copy" ? "Copied" : "Moved"} ${count} item${count === 1 ? "" : "s"}${where}`);
      }
      return count;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : `${mode === "copy" ? "Copy" : "Move"} failed`);
      return 0;
    } finally {
      // Partial work is still work: whatever got written before a failure
      // should show, not wait for the next refresh.
      queryClient.invalidateQueries({ queryKey: ["resources"] });
      queryClient.invalidateQueries({ queryKey: ["resource-folders"] });
      setTransferring(false);
    }
  };

  const openTransfer = (mode: "move" | "copy", items: { fileIds: string[]; folderIds: string[] }) => {
    setTransferCategoryId(subsection.id);
    setTransfer({ mode, ...items });
  };

  /** Whatever is selected, split into the two kinds the writes care about. */
  const selectedItems = () => ({
    fileIds: selectedFiles.map((r) => r.id),
    folderIds: selectedFolders.map((f) => f.id),
  });

  /** "Make a copy": a duplicate beside the original, in the same folder. */
  const duplicateHere = (kind: "file" | "folder", id: string) => {
    const folderId = kind === "folder"
      ? folders.find((f) => f.id === id)?.parent_folder_id ?? null
      : resources.find((r) => r.id === id)?.folder_id ?? null;
    const items = kind === "folder" ? { fileIds: [], folderIds: [id] } : { fileIds: [id], folderIds: [] };
    return transferItems("copy", items, { subsectionId: subsection.id, folderId });
  };

  /* ---------- Drag handlers ---------- */

  /**
   * Picking rows up.
   *
   * A row that is part of the selection drags the whole selection; a row that
   * is not becomes the selection, because dragging something you had not
   * selected and watching four other things move with it is nobody's idea of
   * what just happened.
   */
  const dragGroupFor = (rowId: string) =>
    selection.has(rowId) ? [...selection] : [rowId];

  const handleDragStart = (source: DragSource) => {
    if (!selection.has(source.id)) setSelection(new Set([source.id]));
  };

  /**
   * Rearranging is only meaningful against the hand-arranged order.
   *
   * While a column sort is on, the positions on screen are a temporary view
   * over that order, so writing a drop into it would silently rewrite the
   * arrangement to match the view. The rows stop offering gaps at all in that
   * state, so this is the backstop rather than the explanation — but if a gap
   * is ever reached while sorted, it must say so rather than quietly obey.
   */
  const refuseWhileSorted = () => {
    if (!sort) return false;
    toast.info("Turn off sorting to rearrange", {
      description: "Click the highlighted column heading again to go back to the arranged order.",
    });
    return true;
  };

  /**
   * What a drop means.
   *
   * Two shapes, and the engine has already decided which: landing on the
   * middle of a folder, on the list itself or on a breadcrumb is a move *into*
   * somewhere; landing on a row's edge is a place in an order. Neither is
   * inferred here from where the drag began — the gap the indicator drew is
   * the gap that gets written.
   */
  const handleDrop = async ({ source, over }: DropEvent) => {
    if (!over) return;

    const fileIds = source.ids.filter((id) => !isFolderRowId(id));
    const folderIds = source.ids.filter(isFolderRowId).map(folderIdOf);
    if (!fileIds.length && !folderIds.length) return;

    // Onto a category's name in the rail: into the top of that category.
    if (over.data.kind === "section") {
      if (over.id === subsection.id) return;
      const moved = await transferItems("move", { fileIds, folderIds }, { subsectionId: over.id, folderId: null });
      if (moved) clearSelection();
      return;
    }

    if (over.edge === "into") {
      const target = dropDestination(over.id);
      if (!target) return;
      const moved = await moveItemsToTarget({ fileIds, folderIds }, target);
      if (!moved) return;
      toast.success(`Moved ${moved} item${moved === 1 ? "" : "s"}`);
      clearSelection();
      return;
    }

    if (refuseWhileSorted()) return;

    try {
      await placeBeside(over.id, over.edge, { fileIds, folderIds });
      clearSelection();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Reorder failed");
    }
  };

  /** The folder a drop "into" something names. Null is the section itself. */
  const dropDestination = (overId: string): { folderId: string | null } | null => {
    if (isFolderRowId(overId)) {
      const folderId = folderIdOf(overId);
      return folders.some((f) => f.id === folderId) ? { folderId } : null;
    }
    if (overId.startsWith("crumb:")) {
      // A breadcrumb moves things back up to that level; "crumb:root" is the
      // section, which is where a folder with no parent belongs.
      const crumb = overId.replace("crumb:", "");
      return { folderId: crumb === "root" ? null : crumb };
    }
    if (overId === "section-root") return { folderId: currentFolder?.id ?? null };
    return null;
  };

  /**
   * A drop in the gap above or below a row.
   *
   * The row beside the gap says which list is being arranged, and rows of the
   * other kind travel with it into the folder that list lives in — dragging a
   * file and a folder together onto a gap should not leave half the selection
   * behind.
   */
  const placeBeside = async (
    overId: string,
    edge: "before" | "after",
    items: { fileIds: string[]; folderIds: string[] },
  ) => {
    if (isFolderRowId(overId)) {
      const overFolderId = folderIdOf(overId);
      const over = folders.find((f) => f.id === overFolderId);
      if (!over) return;

      const movable = items.folderIds.filter((id) => {
        if (canMoveFolder(folders, id, over.parent_folder_id ?? null)) return true;
        const f = folders.find((x) => x.id === id);
        toast.error(`"${f?.name ?? "Folder"}" cannot go inside itself`, {
          description: "Pick a place that is not inside the folder you are moving.",
        });
        return false;
      });

      const writes = planFolderReorder(
        folders.map((f) => ({
          id: f.id,
          parent_folder_id: f.parent_folder_id ?? null,
          sort_order: f.sort_order ?? 0,
        })),
        movable, overFolderId, edge,
      );
      for (const w of writes) {
        await updateFolder.mutateAsync({
          id: w.id, parentId: w.parent_folder_id, sort_order: w.sort_order,
        });
      }
      if (items.fileIds.length) {
        await moveItemsToTarget(
          { fileIds: items.fileIds, folderIds: [] },
          { folderId: over.parent_folder_id ?? null },
        );
      }
      return;
    }

    const writes = planReorder(resources, items.fileIds, overId, edge);
    for (const w of writes) {
      await updateResourcePlacement.mutateAsync(w);
    }
    if (items.folderIds.length) {
      const over = resources.find((r) => r.id === overId);
      await moveItemsToTarget(
        { fileIds: [], folderIds: items.folderIds },
        { folderId: over?.folder_id ?? null },
      );
    }
  };

  /** Refuses a folder that would end up inside itself, before it lights up. */
  const acceptsInto = (folderId: string) => (source: DragSource) =>
    isDriveDrag(source) && source.ids
      .filter(isFolderRowId)
      .map(folderIdOf)
      .every((id) => canMoveFolder(folders, id, folderId));

  const dragHandlers: DriveDragHandlers = {
    onDrop: handleDrop,
    onDragStart: handleDragStart,
    renderPreview: (source) => (
      <DragPreview
        count={source.ids.length}
        label={
          isFolderRowId(source.id)
            ? folders.find((f) => f.id === folderIdOf(source.id))?.name ?? "Folder"
            : resources.find((r) => r.id === source.id)?.title ?? "File"
        }
        kind={isFolderRowId(source.id) ? "folder" : "file"}
      />
    ),
  };

  // Handed up to the page's provider on every render, so a drop is always
  // judged against the selection and folders as they are now.
  const dragHost = useContext(DriveDragHostContext);
  useEffect(() => {
    if (!dragHost) return;
    dragHost.current = dragHandlers;
    return () => {
      if (dragHost.current === dragHandlers) dragHost.current = null;
    };
  });

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
  const sameCategory = transferCategoryId === subsection.id;
  // Another category's folders come from the page; this one's are the props,
  // which are what the rest of the browser is drawn from.
  const targetFolders = sameCategory
    ? folders
    : allFolders.filter((f) => f.subsection_id === transferCategoryId);
  const moveTargets = flattenDrive({
    folders: targetFolders,
    files: [],
    expanded: new Set(targetFolders.map((f) => f.id)),
    sortFolders,
  })
    .filter((row) => row.kind === "folder")
    .map((row) => ({
      folder: row.folder!,
      depth: row.depth,
      // Only a move inside one category can tie a folder in a knot. A copy is
      // taken from the branch as it was, and another category is another tree.
      allowed: !sameCategory || movingFolderIds.every((id) => canMoveFolder(folders, id, row.id)),
    }));

  const runTransfer = async (folderId: string | null) => {
    if (!transfer) return;
    const { mode, fileIds, folderIds } = transfer;
    await transferItems(mode, { fileIds, folderIds }, { subsectionId: transferCategoryId, folderId });
    setTransfer(null);
    clearSelection();
  };

  const toggleExpanded = (id: string) =>
    setExpanded((open) =>
      open.has(id)
        ? collapseWithDescendants(folders, open, id)
        : new Set(open).add(id),
    );

  const openFolder = (id: string) => {
    setCurrentFolderId(id);
    clearSelection();
    setHighlighted(null);
  };

  // Scroll the highlighted row into the middle of the screen once it exists.
  const highlightOnScreen = !!highlighted && rows.some((row) => row.id === highlighted);
  useEffect(() => {
    if (!highlightOnScreen || arrivedRef.current) return;
    // A frame late, so the page's own scroll-to-top on arrival has already
    // happened and does not undo this.
    const frame = requestAnimationFrame(() => {
      arrivedRef.current = true;
      document
        .querySelector(`[data-drive-row="${CSS.escape(highlighted!)}"]`)
        ?.scrollIntoView({ block: "center", behavior: "smooth" });
    });
    return () => cancelAnimationFrame(frame);
  }, [highlightOnScreen, highlighted]);

  // The file's row opens its own viewer when it mounts with the signal (a
  // child's effect runs before this one), so by here the request is spent.
  const openRequestShown = !!openHighlighted && !!highlightId &&
    rows.some((row) => row.kind === "file" && row.id === highlightId);
  useEffect(() => {
    if (openRequestShown) onOpenedHighlighted?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openRequestShown]);

  const renderRows = () => (
    <Section id="section-root" empty={rows.length === 0}>
      {rows.map((row, index) =>
        row.kind === "folder" ? (
          <FolderRow
            key={row.id}
            folder={row.folder!}
            depth={row.depth}
            index={index}
            dragGroup={dragGroupFor(folderRowId(row.id))}
            accepts={acceptsInto(row.id)}
            reorderable={!sort}
            hasChildren={!!row.hasChildren}
            expanded={!!row.expanded}
            onToggleExpanded={() => toggleExpanded(row.id)}
            count={folderCounts(folders, resources, row.id).total}
            selected={selection.has(`folder-row:${row.id}`)}
            highlighted={highlighted === row.id}
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
            onMove={() => openTransfer("move", { fileIds: [], folderIds: [row.id] })}
            onCopyTo={() => openTransfer("copy", { fileIds: [], folderIds: [row.id] })}
            onDuplicate={() => duplicateHere("folder", row.id)}
          />
        ) : (
          <FileRow
            key={row.id}
            resource={row.file!}
            depth={row.depth}
            index={index}
            dragGroup={dragGroupFor(row.id)}
            reorderable={!sort}
            selected={selection.has(row.id)}
            highlighted={highlighted === row.id}
            openSignal={openHighlighted && highlightId === row.id ? arrivalKey ?? "open" : undefined}
            onClick={(e) => handleRowClick(row.id, e)}
            canManage={canManage}
            selectMode={selectMode}
            onDelete={(id) => deleteResource.mutate(id)}
            onMove={(id) => openTransfer("move", { fileIds: [id], folderIds: [] })}
            onCopyTo={(id) => openTransfer("copy", { fileIds: [id], folderIds: [] })}
            onDuplicate={(id) => duplicateHere("file", id)}
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

      {/* One provider for the toolbar and the list together, because the
          breadcrumb's crumbs are drop targets too. With the provider around
          the list alone, opening any folder drew a crumb outside it and the
          whole page fell over — the root showed no trail, so it never came up
          until someone clicked in.

          On a specialty page the provider is the page's, so the category rail
          is in it too; this one is only drawn when there is no such host. */}
      <MaybeDragProvider host={!!dragHost} handlers={dragHandlers}>
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
        />
        <div className="ml-auto flex items-center gap-1.5 flex-wrap">
          <SortMenu sort={sort} onChange={setSort} />
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
        <SortHeader sort={sort} column="updated" onSort={toggleSort} className="hidden w-[110px] shrink-0 justify-end lg:flex">Modified</SortHeader>
      </div>

      {sort && (
        <p className="px-1 text-[12px] text-muted-foreground">
          Sorted by {SORT_LABELS[sort.key].toLowerCase()}, {directionLabel(sort.key, sort.dir).toLowerCase()}.{" "}
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
      {renderRows()}
      </MaybeDragProvider>

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
                  onClick={() => openTransfer("move", selectedItems())}>
                  <FolderInput className="h-3.5 w-3.5" /> Move
                </Button>
                <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs"
                  onClick={() => openTransfer("copy", selectedItems())}>
                  <Copy className="h-3.5 w-3.5" /> Copy
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

      {/* Move / copy dialog */}
      <Dialog open={!!transfer} onOpenChange={(o) => { if (!o && !transferring) setTransfer(null); }}>
        <DialogContent>
          {(() => {
            const count = (transfer?.fileIds.length ?? 0) + (transfer?.folderIds.length ?? 0);
            const verb = transfer?.mode === "copy" ? "Copy" : "Move";
            return (
              <DialogHeader>
                <DialogTitle>{verb} {count} item{count === 1 ? "" : "s"}</DialogTitle>
                <DialogDescription>
                  Pick a category, then where in it {transfer?.mode === "copy" ? "the copies" : "they"} should go.
                </DialogDescription>
              </DialogHeader>
            );
          })()}
          {categories.length > 1 && (
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={transferCategoryId} onValueChange={setTransferCategoryId}>
                <SelectTrigger aria-label="Category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}{c.id === subsection.id ? " (this category)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="max-h-72 space-y-1 overflow-y-auto">
            <button
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-secondary disabled:cursor-wait disabled:opacity-60"
              disabled={transferring}
              onClick={() => runTransfer(null)}
            >
              <FileText className="h-4 w-4" /> {categoryName(transferCategoryId)} (top of category)
            </button>
            {moveTargets.map(({ folder, depth, allowed }) => (
              <button
                key={folder.id}
                disabled={!allowed || transferring}
                title={allowed ? undefined : "A folder cannot go inside itself"}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
                style={{ paddingLeft: `${12 + depth * 18}px` }}
                onClick={() => runTransfer(folder.id)}
              >
                <FolderClosed className="h-4 w-4 shrink-0 text-rule" /> {folder.name}
              </button>
            ))}
          </div>
          {transferring && (
            <p className="text-[13px] text-muted-foreground">
              {transfer?.mode === "copy" ? "Copying…" : "Moving…"}
            </p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ---------- Subcomponents ---------- */

const SORT_KEYS: SortKey[] = ["name", "type", "updated", "size"];

/**
 * Sorting from a menu, as well as from the column headings.
 *
 * The headings work, but nothing about them says so, and on a phone three of
 * the four are hidden for width. This is the same state with every option in
 * reach: what to sort by, which way round, or back to the arranged order —
 * which is still where drag-and-drop works.
 */
function SortMenu({
  sort, onChange,
}: {
  sort: SortState | null;
  onChange: (sort: SortState | null) => void;
}) {
  const key = sort?.key ?? "arranged";
  const dir: SortDir = sort?.dir ?? "asc";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" aria-label="Sort">
          <ArrowUpDown className="h-3.5 w-3.5" />
          {sort ? `${SORT_LABELS[sort.key]} · ${directionLabel(sort.key, sort.dir)}` : "Sort"}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Sort by</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={key}
          // A newly chosen key starts the way round people usually want it:
          // newest and largest first, names and types A → Z. Picking the key
          // already in use keeps the direction you had.
          onValueChange={(v) => onChange(v === "arranged" ? null : {
            key: v as SortKey,
            dir: v === sort?.key ? dir : v === "updated" || v === "size" ? "desc" : "asc",
          })}
        >
          <DropdownMenuRadioItem value="arranged">Arranged order</DropdownMenuRadioItem>
          {SORT_KEYS.map((k) => (
            <DropdownMenuRadioItem key={k} value={k}>{SORT_LABELS[k]}</DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        {sort && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Order</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={sort.dir}
              onValueChange={(v) => onChange({ key: sort.key, dir: v as SortDir })}
            >
              <DropdownMenuRadioItem value="asc">{directionLabel(sort.key, "asc")}</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="desc">{directionLabel(sort.key, "desc")}</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** The drive's own drag provider, for when no page above it supplies one. */
function MaybeDragProvider({
  host, handlers, children,
}: {
  host: boolean;
  handlers: DriveDragHandlers;
  children: React.ReactNode;
}) {
  if (host) return <>{children}</>;
  return (
    <DragProvider
      axis="vertical"
      onDragStart={handlers.onDragStart}
      onDrop={handlers.onDrop}
      renderPreview={handlers.renderPreview}
    >
      {children}
    </DragProvider>
  );
}

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
  id, children, empty,
}: {
  id: string;
  children?: React.ReactNode;
  empty: boolean;
}) {
  // The list as a whole. Rows sit on top of it, so this catches only the space
  // around them — which is what "put it in the folder I am looking at" means.
  const { setNodeRef, dropProps, isOver: active } = useDropTarget({ id, mode: "into", accepts: isDriveDrag });

  return (
    <div
      ref={setNodeRef}
      {...dropProps}
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
  subsectionName, path, onNavigate,
}: {
  subsectionName: string;
  path: { id: string; name: string }[];
  onNavigate: (folderId: string | null) => void;
}) {
  if (!path.length) return null;
  return (
    <nav aria-label="Folder path" className="flex min-w-0 flex-wrap items-center gap-1 text-sm">
      <Crumb id="root" label={subsectionName} onClick={() => onNavigate(null)} />
      {path.map((folder, index) => {
        const last = index === path.length - 1;
        return (
          <span key={folder.id} className="flex min-w-0 items-center gap-1">
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
            {last ? (
              <span className="truncate font-semibold" aria-current="page">{folder.name}</span>
            ) : (
              <Crumb id={folder.id} label={folder.name} onClick={() => onNavigate(folder.id)} />
            )}
          </span>
        );
      })}
    </nav>
  );
}

function Crumb({
  id, label, onClick,
}: {
  id: string;
  label: string;
  onClick: () => void;
}) {
  const { setNodeRef, dropProps, isOver: active } = useDropTarget({ id: `crumb:${id}`, mode: "into", accepts: isDriveDrag });
  return (
    <button
      ref={setNodeRef}
      {...dropProps}
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
      {/* As wide as the row it came from: the preview is positioned by where
          the row was taken hold of, so one narrower than the row would sit
          away from the pointer whenever a row was grabbed by its right end. */}
      <div className="flex items-center gap-2 rounded-md border-2 border-rule bg-card px-3 py-2 shadow-2xl ring-4 ring-rule">
        {kind === "folder" ? <FolderClosed className="h-4 w-4 text-rule" /> : <FileText className="h-4 w-4 text-rule" />}
        <span className="truncate text-sm font-medium">{label}</span>
        {count > 1 && (
          <Badge className="ml-auto shrink-0 bg-accent text-accent-foreground">{count}</Badge>
        )}
      </div>
    </div>
  );
}
