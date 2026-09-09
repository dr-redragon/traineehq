import { useEffect, useRef, useState } from "react";
import { useParams, useLocation, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/DashboardLayout";
import { ContactCard } from "@/components/ContactCard";
import { DiscussionBoard } from "@/components/DiscussionBoard";
import { SpecialtyNoticeBoard } from "@/components/SpecialtyNoticeBoard";
import { DriveBrowser } from "@/components/drive/DriveBrowser";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { Users, MessageSquare, Plus, MoreVertical, Pencil, Trash2, ChevronLeft, ChevronRight } from "lucide-react";

import { toast } from "sonner";
import { useCanManageSpecialty } from "@/hooks/useUserRole";
import { getIcon } from "@/lib/iconMap";
import { isUuid, orFilterValue } from "@/lib/queryFilters";
import {
  DndContext, closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, horizontalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { SortableTabTrigger } from "@/components/SortableTabTrigger";
import { useDragSensors } from "@/hooks/useDragSensors";

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
  const [moveTargetId, setMoveTargetId] = useState<string>("");

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

  useEffect(() => {
    if (location.hash === "#discussion" && discussionRef.current) {
      setTimeout(() => discussionRef.current?.scrollIntoView({ behavior: "smooth" }), 300);
    }
    if (location.hash === "#contacts") {
      setActiveTab("Key Contacts");
    }
  }, [location.hash]);

  const sensors = useDragSensors();

  const { data: specialty, isLoading: specLoading } = useQuery({
    queryKey: ["specialty", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("specialties")
        .select("*")
        .eq("id", id!)
        .is("deleted_at", null)
        .maybeSingle();
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

  // The list of subheadings a subsection has. Distinct from the `subheading`
  // string on each resource, which stays the thing that assigns one.
  const { data: resourceSubheadings } = useQuery({
    queryKey: ["resource-subheadings", id, subsectionIds],
    queryFn: async () => {
      if (!subsectionIds.length) return [];
      const { data, error } = await supabase
        .from("resource_subheadings")
        .select("*")
        .in("subsection_id", subsectionIds)
        .order("sort_order")
        .returns<{ id: string; subsection_id: string; name: string; sort_order: number }[]>();
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
        .or(`specialty_id.eq.${orFilterValue(id!)},specialty_id.is.null`)
        .eq("archived", false);
      if (error) throw error;
      return data;
    },
    // The id lands inside an `or` filter expression, so only run it for a well-formed uuid.
    enabled: isUuid(id),
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

            const subFolders = (resourceFolders ?? []).filter((f) => f.subsection_id === sub.id);
            const subSubheadings = (resourceSubheadings ?? []).filter((h) => h.subsection_id === sub.id);

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
                  folders={subFolders}
                  subheadings={subSubheadings}
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
