import { useEffect, useRef, useState } from "react";
import { useParams, useLocation, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/DashboardLayout";
import { ContactCard } from "@/components/ContactCard";
import { DiscussionBoard } from "@/components/DiscussionBoard";
import { SpecialtyNoticeBoard } from "@/components/SpecialtyNoticeBoard";
import { DroppableSubheadingGroup, DroppableUngrouped } from "@/components/DroppableSubheadingGroup";
import { AddResourceDialog } from "@/components/AddResourceDialog";
import { AddFolderDialog } from "@/components/AddFolderDialog";
import { ResourceFolder } from "@/components/ResourceFolder";
import { ResourceDragPreview } from "@/components/ResourceCard";
import { DriveBrowser } from "@/components/drive/DriveBrowser";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Users, MessageSquare, FolderOpen, Plus, MoreVertical, Pencil, Trash2, ListPlus, CheckSquare, ChevronLeft, ChevronRight } from "lucide-react";
import { BulkActionBar } from "@/components/BulkActionBar";
import { UploadProgressBar } from "@/components/UploadProgressBar";
import { FileDropOverlay } from "@/components/FileDropOverlay";

import { toast } from "sonner";
import { useCanManageSpecialty } from "@/hooks/useUserRole";
import { getIcon } from "@/lib/iconMap";
import {
  DndContext, DragOverlay, closestCenter, KeyboardSensor, PointerSensor, pointerWithin,
  rectIntersection, useSensor, useSensors, type CollisionDetection, type DragEndEvent,
  type DragOverEvent, type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, horizontalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { SortableTabTrigger } from "@/components/SortableTabTrigger";
import type { Tables } from "@/integrations/supabase/types";
import { downloadResourcesAsZip } from "@/lib/resourceDownloads";

const UNGROUPED_DROP_ID = "group:__ungrouped__";

const getGroupDropId = (subheading: string | null | undefined) =>
  subheading ? `group:${subheading}` : UNGROUPED_DROP_ID;

const getResourceDropId = (resource: Tables<"resources">) => {
  const folderId = (resource as any).folder_id as string | null;
  const subheading = (resource as any).subheading as string | null;

  return folderId ? `folder:${folderId}` : getGroupDropId(subheading);
};

const resourceCollisionDetection: CollisionDetection = (args) => {
  const pointerCollisions = pointerWithin(args);
  if (pointerCollisions.length > 0) return pointerCollisions;
  return rectIntersection(args);
};

const SpecialtyDetail = () => {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { data: hasEditRights } = useCanManageSpecialty(id);
  const [editMode, setEditMode] = useState(false);
  const canManage = !!hasEditRights && editMode;
  const discussionRef = useRef<HTMLDivElement>(null);

  const [activeTab, setActiveTab] = useState<string | null>(null);

  // Subsection management state
  const [addSubOpen, setAddSubOpen] = useState(false);
  const [newSubName, setNewSubName] = useState("");
  const [renameSubId, setRenameSubId] = useState<string | null>(null);
  const [renameSubName, setRenameSubName] = useState("");
  const [deleteSubId, setDeleteSubId] = useState<string | null>(null);
  const [deleteAction, setDeleteAction] = useState<"move" | "delete">("move");
  const [addSubheadingForSub, setAddSubheadingForSub] = useState<string | null>(null);
  const [newSubheadingName, setNewSubheadingName] = useState("");
  // Track manually added (empty) subheadings per subsection so they show before any resource is assigned
  const [manualSubheadings, setManualSubheadings] = useState<Record<string, string[]>>({});
  const [moveTargetId, setMoveTargetId] = useState<string>("");
  const [nativeDropSub, setNativeDropSub] = useState<string | null>(null);
  const [nativeDropItemCount, setNativeDropItemCount] = useState(0);
  const [nativeDropUploading, setNativeDropUploading] = useState(false);
  const [nativeUploadProgress, setNativeUploadProgress] = useState({ current: 0, total: 0, fileName: "" });
  const [selectMode, setSelectMode] = useState(false);
  const [selectedResourceIds, setSelectedResourceIds] = useState<Set<string>>(new Set());
  const [selectedFolderIds, setSelectedFolderIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkDownloading, setBulkDownloading] = useState(false);
  const [activeDragResourceId, setActiveDragResourceId] = useState<string | null>(null);
  const [activeDragTargetId, setActiveDragTargetId] = useState<string | null>(null);

  const tabsListRef = useRef<HTMLDivElement>(null);
  const [tabsScroll, setTabsScroll] = useState({
    left: 0,
    canScrollLeft: false,
    canScrollRight: false,
  });

  const updateTabsScroll = () => {
    const el = tabsListRef.current;
    if (!el) return;
    const maxScroll = el.scrollWidth - el.clientWidth;
    setTabsScroll({
      left: el.scrollLeft,
      canScrollLeft: el.scrollLeft > 2,
      canScrollRight: el.scrollLeft < maxScroll - 2 && maxScroll > 2,
    });
  };

  useEffect(() => {
    updateTabsScroll();
    const el = tabsListRef.current;
    if (!el) return;
    const onScroll = () => updateTabsScroll();
    el.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", updateTabsScroll);
    const observer = new MutationObserver(updateTabsScroll);
    observer.observe(el, { childList: true, subtree: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", updateTabsScroll);
      observer.disconnect();
    };
  }, []);

  const toggleSelectResource = (id: string) => {
    setSelectedResourceIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectFolder = (folderId: string, resourceIds: string[]) => {
    setSelectedFolderIds((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
        // Also deselect contained resources
        setSelectedResourceIds((rPrev) => {
          const rNext = new Set(rPrev);
          resourceIds.forEach((id) => rNext.delete(id));
          return rNext;
        });
      } else {
        next.add(folderId);
        // Also select contained resources
        setSelectedResourceIds((rPrev) => {
          const rNext = new Set(rPrev);
          resourceIds.forEach((id) => rNext.add(id));
          return rNext;
        });
      }
      return next;
    });
  };

  const clearSelection = () => {
    setSelectMode(false);
    setSelectedResourceIds(new Set());
    setSelectedFolderIds(new Set());
  };

  const getDropLabel = (targetId: string | null, folders: Tables<"resource_folders">[] | undefined) => {
    if (!targetId) return null;
    if (targetId.startsWith("folder:")) {
      const folder = folders?.find((item) => item.id === targetId.replace("folder:", ""));
      return folder ? `Move into ${folder.name}` : "Move into folder";
    }
    if (targetId === UNGROUPED_DROP_ID) return "Move to ungrouped";
    if (targetId.startsWith("group:")) return `Move into ${targetId.replace("group:", "")}`;
    return null;
  };

  const handleBulkDelete = async () => {
    setBulkDeleting(true);
    try {
      // Delete selected folders and their contents
      for (const folderId of selectedFolderIds) {
        const folderResources = (resources ?? []).filter((r) => (r as any).folder_id === folderId);
        for (const r of folderResources) {
          await supabase.from("resources").delete().eq("id", r.id);
        }
        await supabase.from("resource_folders").delete().eq("id", folderId);
      }
      // Delete individually selected resources (not already deleted via folder)
      for (const rid of selectedResourceIds) {
        const resource = (resources ?? []).find((r) => r.id === rid);
        if (resource && !selectedFolderIds.has((resource as any).folder_id ?? "")) {
          await supabase.from("resources").delete().eq("id", rid);
        }
      }
      toast.success("Selected items deleted");
      queryClient.invalidateQueries({ queryKey: ["resources"] });
      queryClient.invalidateQueries({ queryKey: ["resource-folders"] });
      clearSelection();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBulkDeleting(false);
    }
  };

  const handleBulkDownload = async () => {
    setBulkDownloading(true);
    try {
      const allResources = resources ?? [];
      const folderResources = Array.from(selectedFolderIds).flatMap((folderId) =>
        allResources
          .filter((r) => (r as any).folder_id === folderId)
          .map((resource) => ({
            resource,
            folderId,
          }))
      );
      const individualResources = allResources.filter(
        (r) => selectedResourceIds.has(r.id) && !selectedFolderIds.has((r as any).folder_id ?? "")
      );

      // Build folder name map
      const folderNameMap: Record<string, string> = {};
      for (const fId of selectedFolderIds) {
        const folder = (resourceFolders ?? []).find((f: any) => f.id === fId);
        if (folder) folderNameMap[fId] = (folder as any).name;
      }

      const filesToZip = [
        ...folderResources.map(({ resource, folderId }) => ({
          resource,
          folderName: folderNameMap[folderId] || "folder",
        })),
        ...individualResources.map((r) => ({ resource: r, folderName: null as string | null })),
      ];

      if (filesToZip.length === 0) {
        toast.error("No downloadable files selected");
        return;
      }

      const { downloaded, skippedCount } = await downloadResourcesAsZip(
        filesToZip,
        `resources-${new Date().toISOString().slice(0, 10)}`,
      );

      toast.success(
        skippedCount > 0
          ? `${downloaded} file(s) downloaded, ${skippedCount} skipped`
          : `${downloaded} file(s) downloaded`,
      );
    } catch (e: any) {
      toast.error(e.message || "Unable to download the selected files");
    } finally {
      setBulkDownloading(false);
    }
  };

  const handleNativeFileDrop = async (e: React.DragEvent, subsectionId: string) => {
    e.preventDefault();
    setNativeDropSub(null);
    setNativeDropUploading(true);
    try {
      const { getDroppedFiles, detectResourceType } = await import("@/lib/fileDropUtils");
      const droppedFiles = await getDroppedFiles(e.dataTransfer);
      if (!droppedFiles.length) return;

      const { data: { user } } = await supabase.auth.getUser();
      const { data: existing } = await supabase
        .from("resources")
        .select("sort_order")
        .eq("subsection_id", subsectionId)
        .order("sort_order", { ascending: false })
        .limit(1);
      let nextOrder = ((existing?.[0]?.sort_order ?? -1) + 1);

      // Group by folder name to auto-create folders
      const folderNames = [...new Set(droppedFiles.map((d) => d.folderName).filter(Boolean))] as string[];
      const folderIdMap: Record<string, string> = {};

      for (const folderName of folderNames) {
        // Find a unique folder name; if taken, append (2), (3), etc.
        const { data: siblings } = await supabase
          .from("resource_folders")
          .select("name")
          .eq("subsection_id", subsectionId);
        const takenNames = new Set(((siblings as any) ?? []).map((r: any) => r.name as string));
        let uniqueName = folderName;
        let n = 2;
        while (takenNames.has(uniqueName)) {
          uniqueName = `${folderName} (${n++})`;
        }
        const { data: folderData, error: folderErr } = await supabase
          .from("resource_folders")
          .insert({ name: uniqueName, subsection_id: subsectionId, sort_order: 0 } as any)
          .select("id")
          .single();
        if (folderErr) { toast.error(`Failed to create folder: ${uniqueName}`); continue; }
        folderIdMap[folderName] = (folderData as any).id;
      }
      setNativeUploadProgress({ current: 0, total: droppedFiles.length, fileName: "" });

      for (let i = 0; i < droppedFiles.length; i++) {
        const { folderName, file } = droppedFiles[i];
        setNativeUploadProgress({ current: i + 1, total: droppedFiles.length, fileName: file.name });
        const ext = file.name.split(".").pop();
        const path = `${id}/${subsectionId}/${crypto.randomUUID()}.${ext}`;
        const { error: uploadErr } = await supabase.storage.from("resources").upload(path, file);
        if (uploadErr) { toast.error(`Failed: ${file.name}`); continue; }

        await supabase.from("resources").insert({
          title: file.name.replace(/\.[^.]+$/, ""),
          resource_type: detectResourceType(file) as any,
          subsection_id: subsectionId,
          file_url: path,
          added_by: user?.id ?? null,
          sort_order: nextOrder++,
          folder_id: folderName ? folderIdMap[folderName] ?? null : null,
          file_size: file.size,
        } as any);
      }

      const fileCount = droppedFiles.length;
      const folderCount = folderNames.length;
      toast.success(
        folderCount > 0
          ? `Uploaded ${fileCount} file(s) in ${folderCount} folder(s)`
          : `${fileCount} file(s) uploaded`
      );
      queryClient.invalidateQueries({ queryKey: ["resources"] });
      queryClient.invalidateQueries({ queryKey: ["resource-folders"] });
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setNativeDropUploading(false);
    }
  };

  useEffect(() => {
    if (location.hash === "#discussion" && discussionRef.current) {
      setTimeout(() => discussionRef.current?.scrollIntoView({ behavior: "smooth" }), 300);
    }
    if (location.hash === "#contacts") {
      setActiveTab("Key Contacts");
    }
  }, [location.hash]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor)
  );

  const { data: specialty, isLoading: specLoading } = useQuery({
    queryKey: ["specialty", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("specialties")
        .select("*")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const { data: subsections } = useQuery({
    queryKey: ["subsections", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subsections")
        .select("*")
        .eq("specialty_id", id!)
        .order("sort_order");
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  useEffect(() => {
    const subsectionId = searchParams.get("subsection");
    if (subsectionId && subsections) {
      const match = subsections.find((s) => s.id === subsectionId);
      if (match) setActiveTab(match.name);
    }
  }, [searchParams, subsections]);

  const subsectionIds = subsections?.map((s) => s.id) ?? [];
  const { data: resources } = useQuery({
    queryKey: ["resources", id, subsectionIds],
    queryFn: async () => {
      if (!subsectionIds.length) return [];
      const { data, error } = await supabase
        .from("resources")
        .select("*")
        .in("subsection_id", subsectionIds)
        .order("sort_order");
      if (error) throw error;
      return data;
    },
    enabled: subsectionIds.length > 0,
  });

  const { data: resourceFolders } = useQuery({
    queryKey: ["resource-folders", id, subsectionIds],
    queryFn: async () => {
      if (!subsectionIds.length) return [];
      const { data, error } = await supabase
        .from("resource_folders")
        .select("*")
        .in("subsection_id", subsectionIds)
        .order("sort_order");
      if (error) throw error;
      return data;
    },
    enabled: subsectionIds.length > 0,
  });

  const { data: contacts } = useQuery({
    queryKey: ["contacts", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contacts")
        .select("*")
        .or(`specialty_id.eq.${id},specialty_id.is.null`)
        .eq("archived", false);
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const deleteResource = useMutation({
    mutationFn: async (resourceId: string) => {
      const { error } = await supabase.from("resources").delete().eq("id", resourceId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Resource deleted");
      queryClient.invalidateQueries({ queryKey: ["resources"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reorderResources = useMutation({
    mutationFn: async (updates: { id: string; sort_order: number }[]) => {
      for (const u of updates) {
        await supabase.from("resources").update({ sort_order: u.sort_order }).eq("id", u.id);
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["resources"] }),
  });

  const reorderSubsections = useMutation({
    mutationFn: async (updates: { id: string; sort_order: number }[]) => {
      for (const u of updates) {
        await supabase.from("subsections").update({ sort_order: u.sort_order }).eq("id", u.id);
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["subsections", id] }),
  });

  const addSubsection = useMutation({
    mutationFn: async (name: string) => {
      const nextOrder = (subsections?.length ?? 0);
      const { error } = await supabase.from("subsections").insert({
        name,
        specialty_id: id!,
        sort_order: nextOrder,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Section added");
      queryClient.invalidateQueries({ queryKey: ["subsections", id] });
      setAddSubOpen(false);
      setNewSubName("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const renameSubsection = useMutation({
    mutationFn: async ({ subId, name }: { subId: string; name: string }) => {
      const { error } = await supabase.from("subsections").update({ name }).eq("id", subId);
      if (error) throw error;
    },
    onSuccess: (_, { name }) => {
      toast.success("Section renamed");
      queryClient.invalidateQueries({ queryKey: ["subsections", id] });
      if (renameSubId && subsections?.find((s) => s.id === renameSubId)?.name === activeTab) {
        setActiveTab(name);
      }
      setRenameSubId(null);
      setRenameSubName("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteSubsection = useMutation({
    mutationFn: async ({ subId, action, targetId }: { subId: string; action: "move" | "delete"; targetId?: string }) => {
      if (action === "move" && targetId) {
        const { error: moveErr } = await supabase
          .from("resources")
          .update({ subsection_id: targetId })
          .eq("subsection_id", subId);
        if (moveErr) throw moveErr;
      } else {
        const { error: delResErr } = await supabase
          .from("resources")
          .delete()
          .eq("subsection_id", subId);
        if (delResErr) throw delResErr;
      }
      const { error } = await supabase.from("subsections").delete().eq("id", subId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Section deleted");
      queryClient.invalidateQueries({ queryKey: ["subsections", id] });
      queryClient.invalidateQueries({ queryKey: ["resources"] });
      setDeleteSubId(null);
      setDeleteAction("move");
      setMoveTargetId("");
      setActiveTab(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleSubsectionDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !subsections) return;
    const oldIndex = subsections.findIndex((s) => s.id === active.id);
    const newIndex = subsections.findIndex((s) => s.id === over.id);
    const reordered = arrayMove(subsections, oldIndex, newIndex);
    const updates = reordered.map((s, i) => ({ id: s.id, sort_order: i }));
    queryClient.setQueryData(["subsections", id], reordered.map((s, i) => ({ ...s, sort_order: i })));
    reorderSubsections.mutate(updates);
  };

  const updateResourcePlacement = useMutation({
    mutationFn: async ({
      resourceId,
      subheading,
      folderId,
      sortOrder,
    }: {
      resourceId: string;
      subheading: string | null;
      folderId: string | null;
      sortOrder?: number;
    }) => {
      const updateData: any = { subheading, folder_id: folderId };
      if (sortOrder !== undefined) updateData.sort_order = sortOrder;
      const { error } = await supabase.from("resources").update(updateData).eq("id", resourceId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["resources"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const resolveDropTargetId = (overId: string | null, subResources: Tables<"resources">[]) => {
    if (!overId) return null;
    if (overId.startsWith("folder:") || overId.startsWith("group:")) return overId;
    const overResource = subResources.find((resource) => resource.id === overId);
    return overResource ? getResourceDropId(overResource) : null;
  };

  const resetResourceDrag = () => {
    setActiveDragResourceId(null);
    setActiveDragTargetId(null);
  };

  const handleResourceDragStart = (event: DragStartEvent) => {
    if (event.active.data.current?.type !== "resource") return;
    setActiveDragResourceId(String(event.active.id));
    setActiveDragTargetId((event.active.data.current?.containerId as string | null) ?? null);
  };

  const handleResourceDragOver = (event: DragOverEvent, subResources: Tables<"resources">[]) => {
    if (event.active.data.current?.type !== "resource") return;
    setActiveDragTargetId(resolveDropTargetId(event.over ? String(event.over.id) : null, subResources));
  };

  const handleCrossGroupDragEnd = (event: DragEndEvent, subResources: Tables<"resources">[]) => {
    const { active, over } = event;
    const activeId = String(active.id);
    const activeResource = subResources.find((resource) => resource.id === activeId);
    const overId = over ? String(over.id) : null;
    const targetContainerId = resolveDropTargetId(overId, subResources);

    resetResourceDrag();

    if (!activeResource || !targetContainerId) return;

    const sourceContainerId = getResourceDropId(activeResource);
    const targetFolderId = targetContainerId.startsWith("folder:") ? targetContainerId.replace("folder:", "") : null;
    const targetFolder = targetFolderId
      ? (resourceFolders ?? []).find((folder: any) => folder.id === targetFolderId)
      : null;
    const targetSubheading = targetFolder
      ? ((targetFolder as any).subheading ?? null)
      : targetContainerId === UNGROUPED_DROP_ID
        ? null
        : targetContainerId.replace("group:", "");

    if (sourceContainerId !== targetContainerId) {
      const nextSortOrder = subResources.filter((resource) => getResourceDropId(resource) === targetContainerId).length;
      queryClient.setQueryData(["resources", id, subsectionIds], (old: Tables<"resources">[] | undefined) => {
        if (!old) return old;
        return old.map((resource) =>
          resource.id === activeId
            ? { ...resource, folder_id: targetFolderId, subheading: targetSubheading, sort_order: nextSortOrder }
            : resource
        );
      });
      updateResourcePlacement.mutate({
        resourceId: activeId,
        subheading: targetSubheading,
        folderId: targetFolderId,
        sortOrder: nextSortOrder,
      });
      return;
    }

    if (!overId || overId === activeId || overId.startsWith("folder:") || overId.startsWith("group:")) return;

    const containerResources = subResources
      .filter((resource) => getResourceDropId(resource) === sourceContainerId)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    const oldIndex = containerResources.findIndex((resource) => resource.id === activeId);
    const newIndex = containerResources.findIndex((resource) => resource.id === overId);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(containerResources, oldIndex, newIndex);
    const updates = reordered.map((resource, index) => ({ id: resource.id, sort_order: index }));

    queryClient.setQueryData(["resources", id, subsectionIds], (old: Tables<"resources">[] | undefined) => {
      if (!old) return old;
      const reorderMap = new Map(reordered.map((resource, index) => [resource.id, index]));
      return old.map((resource) =>
        reorderMap.has(resource.id)
          ? { ...resource, sort_order: reorderMap.get(resource.id) ?? resource.sort_order }
          : resource
      );
    });

    reorderResources.mutate(updates);
  };

  const deleteSubData = deleteSubId ? subsections?.find((s) => s.id === deleteSubId) : null;
  const deleteSubResourceCount = deleteSubId
    ? (resources ?? []).filter((r) => r.subsection_id === deleteSubId).length
    : 0;
  const otherSubsections = subsections?.filter((s) => s.id !== deleteSubId) ?? [];

  if (specLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64 text-muted-foreground">Loading…</div>
      </DashboardLayout>
    );
  }

  if (!specialty) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64 text-muted-foreground">
          Specialty not found.
        </div>
      </DashboardLayout>
    );
  }

  const Icon = getIcon(specialty.icon_name);
  const color = specialty.color ?? "174 60% 40%";
  const defaultTab = subsections?.[0]?.name ?? "Key Contacts";

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto space-y-6 animate-fade-in">
        <div className="flex items-center gap-4">
          <div
            className="flex h-12 w-12 items-center justify-center rounded-xl"
            style={{ backgroundColor: `hsl(${color} / 0.12)` }}
          >
            <Icon className="h-6 w-6" style={{ color: `hsl(${color})` }} />
          </div>
          <div>
            <h1 className="text-2xl font-display font-bold">{specialty.short_name}</h1>
            <p className="text-sm text-muted-foreground">{specialty.name}</p>
          </div>
          {hasEditRights && (
            <div className="ml-auto flex items-center gap-2 rounded-md border px-3 py-1.5">
              <Switch
                id="edit-mode"
                checked={editMode}
                onCheckedChange={setEditMode}
                aria-label="Toggle edit mode"
              />
              <Label
                htmlFor="edit-mode"
                className={cn("text-xs cursor-pointer", editMode ? "text-accent" : "text-muted-foreground")}
              >
                {editMode ? "✏️ Editing enabled" : "Editing off"}
              </Label>
            </div>
          )}
        </div>

        <SpecialtyNoticeBoard specialtyId={id!} canManage={!!canManage} />

        <Tabs value={activeTab ?? defaultTab} onValueChange={setActiveTab} className="w-full">
          <div className="flex items-center gap-2">
            <div className="flex-1 relative overflow-hidden rounded-md">
              <TabsList
                ref={tabsListRef}
                className={cn(
                  "w-full justify-start h-auto bg-secondary/50 p-1 tabs-scrollbar",
                  tabsScroll.canScrollLeft ? "tabs-fade-both" : "tabs-fade-right"
                )}
              >
                {canManage && subsections?.length ? (
                  <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleSubsectionDragEnd}>
                    <SortableContext items={subsections.map((s) => s.id)} strategy={horizontalListSortingStrategy}>
                      {subsections.map((sub) => (
                        <SortableTabTrigger key={sub.id} id={sub.id} value={sub.name} canDrag>
                          {sub.name}
                        </SortableTabTrigger>
                      ))}
                    </SortableContext>
                  </DndContext>
                ) : (
                  subsections?.map((sub) => (
                    <TabsTrigger key={sub.id} value={sub.name} className="text-xs whitespace-nowrap">
                      {sub.name}
                    </TabsTrigger>
                  ))
                )}
                <TabsTrigger value="Key Contacts" className="text-xs whitespace-nowrap">
                  <Users className="h-3 w-3 mr-1" />
                  Key Contacts
                </TabsTrigger>
              </TabsList>

              {/* Overflow hint gradients */}
              <div
                className={cn(
                  "pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-secondary/90 to-transparent transition-opacity duration-200",
                  tabsScroll.canScrollRight ? "opacity-100" : "opacity-0"
                )}
                aria-hidden="true"
              />
              <div
                className={cn(
                  "pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-secondary/90 to-transparent transition-opacity duration-200",
                  tabsScroll.canScrollLeft ? "opacity-100" : "opacity-0"
                )}
                aria-hidden="true"
              />

              {/* Scroll hint buttons */}
              <button
                type="button"
                onClick={() => tabsListRef.current?.scrollBy({ left: -160, behavior: "smooth" })}
                className={cn(
                  "absolute left-1 top-1/2 -translate-y-1/2 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-background/90 shadow-sm border border-border text-muted-foreground transition-opacity duration-200 hover:text-foreground",
                  tabsScroll.canScrollLeft ? "opacity-100" : "opacity-0 pointer-events-none"
                )}
                aria-hidden={!tabsScroll.canScrollLeft}
                tabIndex={-1}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => tabsListRef.current?.scrollBy({ left: 160, behavior: "smooth" })}
                className={cn(
                  "absolute right-1 top-1/2 -translate-y-1/2 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-background/90 shadow-sm border border-border text-muted-foreground transition-opacity duration-200 hover:text-foreground",
                  tabsScroll.canScrollRight ? "opacity-100" : "opacity-0 pointer-events-none"
                )}
                aria-hidden={!tabsScroll.canScrollRight}
                tabIndex={-1}
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
            {canManage && (
              <Button
                variant="outline"
                size="sm"
                className="shrink-0 gap-1 text-xs h-8"
                onClick={() => setAddSubOpen(true)}
              >
                <Plus className="h-3.5 w-3.5" /> Section
              </Button>
            )}
          </div>

          {subsections?.map((sub) => {
            const subResources = (resources ?? [])
              .filter((r) => r.subsection_id === sub.id)
              .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

            const subFolders = (resourceFolders ?? []).filter((f: any) => f.subsection_id === sub.id);

            const resourceSubheadings = [...new Set(
              subResources.map((r) => (r as any).subheading).filter(Boolean) as string[]
            )];
            const manual = manualSubheadings[sub.id] ?? [];
            const allSubheadings = [...new Set([...resourceSubheadings, ...manual])];

            // Filter out resources that belong to folders for the main list
            const nonFolderResources = subResources.filter((r) => !(r as any).folder_id);
            const ungrouped = nonFolderResources.filter((r) => !(r as any).subheading);
            const grouped = allSubheadings.map((sh) => ({
              name: sh,
              resources: nonFolderResources.filter((r) => (r as any).subheading === sh),
              folders: subFolders.filter((f: any) => f.subheading === sh),
            }));
            const ungroupedFolders = subFolders.filter((f: any) => !f.subheading);

            const hasContent = subResources.length > 0 || subFolders.length > 0 || grouped.length > 0;

            return (
              <TabsContent key={sub.id} value={sub.name} className="mt-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-semibold text-sm">{sub.name}</h3>
                  {canManage && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => {
                          setRenameSubId(sub.id);
                          setRenameSubName(sub.name);
                        }}>
                          <Pencil className="h-3.5 w-3.5 mr-2" /> Rename Section
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => {
                            setDeleteSubId(sub.id);
                            setDeleteAction(otherSubsections.length > 0 ? "move" : "delete");
                            const others = subsections?.filter((s) => s.id !== sub.id) ?? [];
                            setMoveTargetId(others[0]?.id ?? "");
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete Section
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>

                <DriveBrowser
                  subsection={sub}
                  specialtyId={specialty.id}
                  resources={subResources}
                  folders={subFolders as any}
                  canManage={!!canManage}
                />
              </TabsContent>
            );
          })}


          <TabsContent value="Key Contacts" className="mt-4 space-y-4">
            <h3 className="font-semibold text-sm">Key Contacts — {specialty.short_name}</h3>
            {!contacts?.length ? (
              <p className="text-sm text-muted-foreground text-center py-8">No contacts added yet.</p>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {contacts.map((c) => (
                  <ContactCard key={c.id} contact={c} />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>

        <div ref={discussionRef} className="pt-6 border-t">
          <div className="flex items-center gap-2 mb-4">
            <MessageSquare className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-lg font-semibold font-display">Discussion</h2>
          </div>
          <DiscussionBoard specialtyId={id!} />
        </div>
      </div>

      <BulkActionBar
        selectedCount={selectedResourceIds.size + selectedFolderIds.size}
        onDelete={handleBulkDelete}
        onDownload={handleBulkDownload}
        onClear={clearSelection}
        deleting={bulkDeleting}
        downloading={bulkDownloading}
      />

      {/* Add Section Dialog */}
      <Dialog open={addSubOpen} onOpenChange={setAddSubOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Section</DialogTitle>
            <DialogDescription>Create a new section tab for this specialty.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <div className="space-y-1.5">
              <Label>Section Name</Label>
              <Input
                value={newSubName}
                onChange={(e) => setNewSubName(e.target.value)}
                placeholder="e.g. Training Resources"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newSubName.trim()) addSubsection.mutate(newSubName.trim());
                }}
              />
            </div>
            <Button className="w-full" disabled={!newSubName.trim() || addSubsection.isPending} onClick={() => addSubsection.mutate(newSubName.trim())}>
              {addSubsection.isPending ? "Adding…" : "Add Section"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Subheading Dialog */}
      <Dialog open={!!addSubheadingForSub} onOpenChange={(o) => { if (!o) { setAddSubheadingForSub(null); setNewSubheadingName(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Subheading</DialogTitle>
            <DialogDescription>Create a subheading to group resources within this section.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <div className="space-y-1.5">
              <Label>Subheading Name</Label>
              <Input
                value={newSubheadingName}
                onChange={(e) => setNewSubheadingName(e.target.value)}
                placeholder="e.g. Core Curriculum, Assessment Tools"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newSubheadingName.trim() && addSubheadingForSub) {
                    setManualSubheadings((prev) => ({
                      ...prev,
                      [addSubheadingForSub]: [...(prev[addSubheadingForSub] ?? []), newSubheadingName.trim()],
                    }));
                    toast.success("Subheading added");
                    setAddSubheadingForSub(null);
                    setNewSubheadingName("");
                  }
                }}
              />
            </div>
            <Button
              className="w-full"
              disabled={!newSubheadingName.trim()}
              onClick={() => {
                if (addSubheadingForSub) {
                  setManualSubheadings((prev) => ({
                    ...prev,
                    [addSubheadingForSub]: [...(prev[addSubheadingForSub] ?? []), newSubheadingName.trim()],
                  }));
                  toast.success("Subheading added");
                  setAddSubheadingForSub(null);
                  setNewSubheadingName("");
                }
              }}
            >
              Add Subheading
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Rename Section Dialog */}
      <Dialog open={!!renameSubId} onOpenChange={(o) => { if (!o) { setRenameSubId(null); setRenameSubName(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Section</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <div className="space-y-1.5">
              <Label>New Name</Label>
              <Input
                value={renameSubName}
                onChange={(e) => setRenameSubName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && renameSubName.trim() && renameSubId)
                    renameSubsection.mutate({ subId: renameSubId, name: renameSubName.trim() });
                }}
              />
            </div>
            <Button
              className="w-full"
              disabled={!renameSubName.trim() || renameSubsection.isPending}
              onClick={() => { if (renameSubId) renameSubsection.mutate({ subId: renameSubId, name: renameSubName.trim() }); }}
            >
              {renameSubsection.isPending ? "Saving…" : "Rename"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Section Dialog */}
      <Dialog open={!!deleteSubId} onOpenChange={(o) => { if (!o) setDeleteSubId(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete "{deleteSubData?.name}"</DialogTitle>
            <DialogDescription>
              {deleteSubResourceCount > 0
                ? `This section has ${deleteSubResourceCount} resource${deleteSubResourceCount !== 1 ? "s" : ""}. Choose what to do with them.`
                : "This section has no resources and will be removed."}
            </DialogDescription>
          </DialogHeader>
          {deleteSubResourceCount > 0 && (
            <div className="space-y-3 pt-2">
              <div className="space-y-1.5">
                <Label>What should happen to the resources?</Label>
                <Select value={deleteAction} onValueChange={(v) => setDeleteAction(v as "move" | "delete")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {otherSubsections.length > 0 && (
                      <SelectItem value="move">Move to another section</SelectItem>
                    )}
                    <SelectItem value="delete">Delete all resources</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {deleteAction === "move" && otherSubsections.length > 0 && (
                <div className="space-y-1.5">
                  <Label>Move to</Label>
                  <Select value={moveTargetId} onValueChange={setMoveTargetId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select section" />
                    </SelectTrigger>
                    <SelectContent>
                      {otherSubsections.map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDeleteSubId(null)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={deleteSubsection.isPending || (deleteSubResourceCount > 0 && deleteAction === "move" && !moveTargetId)}
              onClick={() => {
                if (deleteSubId) {
                  deleteSubsection.mutate({
                    subId: deleteSubId,
                    action: deleteSubResourceCount > 0 ? deleteAction : "delete",
                    targetId: deleteAction === "move" ? moveTargetId : undefined,
                  });
                }
              }}
            >
              {deleteSubsection.isPending ? "Deleting…" : "Delete Section"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default SpecialtyDetail;
