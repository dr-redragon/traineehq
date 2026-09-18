import { useEffect, useRef, useState } from "react";
import { useParams, useLocation, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/DashboardLayout";
import { ContactCard } from "@/components/ContactCard";
import { SpecialtyDiscussionPreview } from "@/components/SpecialtyDiscussionPreview";
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
import { Users, Plus, MoreVertical, Pencil, Trash2 } from "lucide-react";

import { toast } from "sonner";
import { useCanManageSpecialty } from "@/hooks/useUserRole";
import { getIcon } from "@/lib/iconMap";
import { isUuid, orFilterValue } from "@/lib/queryFilters";
import {
  DndContext, closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
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

  // What the sub-rail shows at the end of each category row. The design puts a
  // count there, and on a rail of eight it is the only way to tell a category
  // worth opening from an empty one without opening it.
  const countOf = (subsectionId: string) =>
    (resources ?? []).filter((r) => r.subsection_id === subsectionId).length;

  return (
    <DashboardLayout breadcrumb={`Specialties / ${specialty.short_name}`}>
      <div className="animate-fade-in">
        {/* "Specialty library" over the name at display scale, on the page's
            own rule — 1B's specialty opening. */}
        <div className="border-b-2 border-border px-9 py-8">
          <div className="flex flex-wrap items-end gap-4">
          <div
            className="flex h-14 w-14 shrink-0 items-center justify-center"
            style={{ backgroundColor: `hsl(${color} / 0.12)` }}
          >
            <Icon className="h-7 w-7" style={{ color: `hsl(${color})` }} />
          </div>
          <div className="min-w-0">
            <p className="ds-kicker mb-1">Specialty library</p>
            <h1 className="font-display text-[clamp(32px,4vw,46px)] font-extrabold leading-none tracking-[-0.03em]">
              {specialty.short_name}
            </h1>
            <p className="mt-2 text-muted-foreground">{specialty.name}</p>
          </div>
          {hasEditRights && (
            <div className="ml-auto flex shrink-0 items-center gap-2 border border-border px-3 py-1.5">
              <Switch
                id="edit-mode"
                checked={editMode}
                onCheckedChange={setEditMode}
                aria-label="Toggle edit mode"
              />
              <Label
                htmlFor="edit-mode"
                className={cn("text-xs cursor-pointer", editMode ? "text-accent-deep" : "text-muted-foreground")}
              >
                {editMode ? "✏️ Editing enabled" : "Editing off"}
              </Label>
            </div>
          )}
          </div>

          {/* The notice board belongs to the specialty, not to its files, so
              it sits in the banner rather than on top of the file list where
              it used to push the files down the page. It draws no border of
              its own — inside a banner that already has one, a second box
              would just be a box in a box. */}
          <div className="mt-6">
            <SpecialtyNoticeBoard specialtyId={id!} canManage={!!canManage} />
          </div>
        </div>

        {/* The categories move off the top of the page and down its left side.

            They used to be a horizontal strip, which is what forced the
            scrolling, the fade masks and the pair of arrow buttons: eight
            category names never fit across a column. Standing them up removes
            the problem rather than decorating it — the rail is as long as it
            needs to be, every name is readable in full at its natural length,
            and the count sits at the end of each row. Reordering by dragging
            survives; the sort strategy turns with the axis.

            Below `lg` the rail lies back down as a scrolling strip, because a
            244px column beside content does not fit on a phone. */}
        <Tabs
          value={activeTab ?? defaultTab}
          onValueChange={setActiveTab}
          orientation="vertical"
          className="w-full"
        >
          <div className="grid lg:grid-cols-[244px_minmax(0,1fr)]">
            <div className="border-b-2 border-border py-5 lg:border-b-0 lg:border-r-2">
              <div className="flex items-baseline justify-between gap-2 px-5 pb-2.5">
                <p className="ds-kicker">Categories</p>
                {canManage && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="-mr-1 h-6 gap-1 px-1.5 text-[11px]"
                    onClick={() => setAddSubOpen(true)}
                  >
                    <Plus className="h-3 w-3" /> Section
                  </Button>
                )}
              </div>
              <TabsList className="ds-subrail tabs-scrollbar flex h-auto w-full flex-row items-stretch gap-0 overflow-x-auto border-b-0 p-0 lg:flex-col lg:overflow-visible">
                {canManage && subsections?.length ? (
                  <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleSubsectionDragEnd}>
                    <SortableContext items={subsections.map((s) => s.id)} strategy={verticalListSortingStrategy}>
                      {subsections.map((sub) => (
                        <SortableTabTrigger
                          key={sub.id}
                          id={sub.id}
                          value={sub.name}
                          canDrag
                          className="w-full"
                          meta={<span className="shrink-0 text-[12px] font-normal text-muted-foreground">{countOf(sub.id)}</span>}
                        >
                          {sub.name}
                        </SortableTabTrigger>
                      ))}
                    </SortableContext>
                  </DndContext>
                ) : (
                  subsections?.map((sub) => (
                    <TabsTrigger key={sub.id} value={sub.name}>
                      <span className="min-w-0">{sub.name}</span>
                      <span className="shrink-0 text-[12px] font-normal text-muted-foreground">{countOf(sub.id)}</span>
                    </TabsTrigger>
                  ))
                )}
                <TabsTrigger value="Key Contacts">
                  <span className="flex min-w-0 items-baseline gap-1.5">
                    <Users className="h-3 w-3 shrink-0 self-center" />
                    Key Contacts
                  </span>
                  <span className="shrink-0 text-[12px] font-normal text-muted-foreground">{contacts?.length ?? 0}</span>
                </TabsTrigger>
              </TabsList>
            </div>

            <div className="flex min-w-0 flex-col gap-8 px-9 pb-12 pt-7">

          {subsections?.map((sub) => {
            const subResources = (resources ?? [])
              .filter((r) => r.subsection_id === sub.id)
              .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

            const subFolders = (resourceFolders ?? []).filter((f) => f.subsection_id === sub.id);
            const subSubheadings = (resourceSubheadings ?? []).filter((h) => h.subsection_id === sub.id);

            return (
              <TabsContent key={sub.id} value={sub.name} className="mt-0 space-y-2">
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="font-display text-xl font-extrabold tracking-tight">{sub.name}</h3>
                  <span className="ml-auto text-[13px] text-muted-foreground">
                    {subResources.length + subFolders.length} item
                    {subResources.length + subFolders.length === 1 ? "" : "s"}
                  </span>
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
            <h3 className="font-display text-lg font-extrabold tracking-tight">Key Contacts — {specialty.short_name}</h3>
            {!contacts?.length ? (
              <p className="py-6 text-sm text-muted-foreground">No contacts added yet.</p>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {contacts.map((c) => (
                  <ContactCard key={c.id} contact={c} />
                ))}
              </div>
            )}
          </TabsContent>
              {/* Only the latest few threads. The whole board — composer,
                  voting, comment trees — now lives at /community/:id, because
                  a second long list under the file browser made the discussion
                  something you could only reach by scrolling past the files,
                  and gave it no address of its own to link anyone to. */}
              <div ref={discussionRef}>
                <SpecialtyDiscussionPreview specialtyId={id!} specialtyName={specialty.short_name} />
              </div>
            </div>
          </div>
        </Tabs>
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
