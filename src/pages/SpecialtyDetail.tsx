import { useEffect, useRef, useState } from "react";
import { useParams, useLocation, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/DashboardLayout";
import { ContactCard } from "@/components/ContactCard";
import { SpecialtyDiscussionPreview } from "@/components/SpecialtyDiscussionPreview";
import { SpecialtyNoticeBoard } from "@/components/SpecialtyNoticeBoard";
import { SectionsEditor } from "@/components/SectionsEditor";
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
import { Settings2, Users, Plus, MoreVertical, Pencil, Trash2 } from "lucide-react";

import { toast } from "sonner";
import { useCanManageSpecialty } from "@/hooks/useUserRole";
import { getIcon } from "@/lib/iconMap";
import { specialtyColorVars } from "@/lib/specialtyColor";
import { isUuid, orFilterValue } from "@/lib/queryFilters";
import { DragProvider, moveItems, slotForEdge, type DropEvent } from "@/lib/dnd";
import { SortableTabTrigger } from "@/components/SortableTabTrigger";

const SpecialtyDetail = () => {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { data: hasEditRights, isPending: rightsPending } = useCanManageSpecialty(id);
  const [editMode, setEditMode] = useState(false);
  const canManage = !!hasEditRights && editMode;
  const discussionRef = useRef<HTMLDivElement>(null);

  const [activeTab, setActiveTab] = useState<string | null>(null);

  // Subsection management state
  const [addSubOpen, setAddSubOpen] = useState(false);
  const [sectionsEditorOpen, setSectionsEditorOpen] = useState(false);
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
        const { error } = await supabase
          .from("subsections").update({ sort_order: u.sort_order }).eq("id", u.id);
        if (error) throw error;
      }
    },
    // The rail was already redrawn in the new order, so a failure has to put
    // it back rather than leave the screen disagreeing with the database.
    onError: (error: Error) => {
      toast.error(error.message ?? "Could not save the new order");
      queryClient.invalidateQueries({ queryKey: ["subsections", id] });
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

  /**
   * Save the rail in a new order.
   *
   * The cache is written first so the rail settles where it was dropped rather
   * than snapping back until Supabase answers; the mutation's own error path
   * puts it back if the save fails.
   */
  const applySubsectionOrder = (reordered: NonNullable<typeof subsections>) => {
    if (!subsections) return;
    const unchanged = reordered.every((sub, i) => sub.id === subsections[i]?.id);
    if (unchanged) return;
    queryClient.setQueryData(["subsections", id], reordered.map((s, i) => ({ ...s, sort_order: i })));
    reorderSubsections.mutate(reordered.map((s, i) => ({ id: s.id, sort_order: i })));
  };

  /** A section dropped in the rail: the gap it was let go over becomes its place. */
  const handleSubsectionDrop = ({ source, over }: DropEvent) => {
    if (!over || !subsections) return;
    const slot = slotForEdge(
      over.index ?? subsections.findIndex((sub) => sub.id === over.id),
      over.edge === "into" ? "before" : over.edge,
    );
    applySubsectionOrder(moveItems(subsections, source.ids, slot, (sub) => sub.id));
  };

  /** The same move from the arrow keys, for anyone not using a pointer. */
  const moveSubsectionBy = (subId: string, direction: -1 | 1) => {
    if (!subsections) return;
    const from = subsections.findIndex((sub) => sub.id === subId);
    const to = from + direction;
    if (from === -1 || to < 0 || to >= subsections.length) return;
    applySubsectionOrder(
      moveItems(subsections, [subId], direction === 1 ? to + 1 : to, (sub) => sub.id),
    );
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

  // A withdrawn specialty — switched off by an admin rather than deleted. The
  // database still hands the row to everyone assigned to it, so without this
  // the rail and the search box would hide it while a bookmark, an old link or
  // a pasted URL walked straight back in. Whoever can manage it still gets
  // through, since they are the ones who turn it back on.
  //
  // Held on the loading state until the rights query settles, so a facilitator
  // does not see this flash before their permissions arrive.
  if (!specialty.is_active && (rightsPending || !hasEditRights)) {
    return (
      <DashboardLayout>
        <div className="flex h-64 items-center justify-center text-muted-foreground">
          {rightsPending ? "Loading…" : "This specialty is no longer available."}
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
            own rule — 1B's specialty opening.

            The icon sits on the name's own line rather than spanning the
            whole block above it — "in line with the specialty name" — so it
            reads as part of the heading rather than a badge floating over
            three lines of text.

            The edit toggle is positioned out of this flow entirely. It used
            to share the wrapping flex row with the icon and name, which meant
            that the moment the row ran out of width — every phone — it
            dropped to a line of its own and made the banner taller. Taken out
            with `absolute` it costs no height at all, on any width, because
            it never participates in the layout its neighbours are wrapping
            in. It has no border or fill of its own now either: on a banner
            this quiet, a box around a two-word toggle was the loudest thing
            in it. */}
        <div className="border-b-2 border-border">
          {/* Padded content, in its own div rather than on this outer one —
              the notice board below is a sibling of this, not a child of it,
              because it draws full-bleed ink bands and a `px-9` here would
              trap them the same 36px in from each edge that the text is.
              (That trap is exactly what happened for one commit: the icon
              and toggle rework folded this into a single padded div, and the
              bands quietly stopped reaching the page's own edges until the
              two were split apart again.) */}
          <div className="relative px-9 pb-8 pt-6 sm:pb-10 sm:pt-8">
            {hasEditRights && (
              <label
                htmlFor="edit-mode"
                className="absolute right-4 top-4 flex shrink-0 cursor-pointer items-center gap-1.5 sm:right-9 sm:top-6"
              >
                <Switch id="edit-mode" checked={editMode} onCheckedChange={setEditMode} aria-label="Toggle edit mode" />
                <span className={cn("text-xs", editMode ? "text-accent-deep" : "text-muted-foreground")}>
                  {editMode ? "Editing" : "View only"}
                </span>
              </label>
            )}
            <p className="ds-kicker mb-1">Specialty library</p>
            <div className="flex min-w-0 items-center gap-3 pr-24 sm:pr-32">
              <Icon className="ds-spec-icon h-8 w-8 shrink-0 sm:h-10 sm:w-10" style={specialtyColorVars(specialty.color)} />
              <h1 className="min-w-0 truncate font-display text-[clamp(26px,4vw,46px)] font-extrabold leading-none tracking-[-0.03em]">
                {specialty.short_name}
              </h1>
            </div>
            <p className="mt-2 text-muted-foreground">{specialty.name}</p>
          </div>

          {/* The notice board belongs to the specialty, not to its files, so
              it sits in the banner rather than on top of the file list where
              it used to push the files down the page. It is outside the
              banner's padding on purpose: it draws ink bands the full width of
              the page, the same as the dashboard's notice, and a band inset by
              a gutter on each side would be the box this layout removed. The
              `pb-*` just above is the gap between the subtitle and this — a
              bit more than the plain bottom padding gave it, so the banner
              does not read as running straight into the first notice. */}
          <SpecialtyNoticeBoard specialtyId={id!} canManage={!!canManage} />
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
            <div className="min-w-0 border-b-2 border-border py-5 lg:border-b-0 lg:border-r-2">
              <div className="px-5 pb-2.5">
                <p className="ds-kicker">Categories</p>
              </div>

              {/* On a phone the rail is a dropdown, not a strip.
                  Laid down as a horizontal strip it ran to 926px inside a
                  390px screen, so every section past the third was reached by
                  swiping sideways — and because a grid item's min-width is
                  `auto`, the strip did not scroll inside its column, it
                  stretched it, dragging the banner and the notice bands out
                  with it. `min-w-0` on the column fixes the stretching; this
                  removes the sideways swipe itself.

                  One control, everything in it, nothing off-screen: the
                  current section is readable without scrolling and any other
                  is two taps away. It is also the native picker on a phone,
                  which is a better target than a 40px-tall tab. */}
              <div className="flex items-center gap-2 px-5 lg:hidden">
                <Select value={activeTab ?? defaultTab} onValueChange={setActiveTab}>
                  <SelectTrigger className="min-w-0 flex-1" aria-label="Choose a section">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {subsections?.map((sub) => (
                      <SelectItem key={sub.id} value={sub.name}>
                        {sub.name} ({countOf(sub.id)})
                      </SelectItem>
                    ))}
                    <SelectItem value="Key Contacts">
                      Key Contacts ({contacts?.length ?? 0})
                    </SelectItem>
                  </SelectContent>
                </Select>
                {canManage && (
                  <Button
                    variant="outline"
                    size="icon"
                    className="shrink-0"
                    aria-label="Edit sections"
                    onClick={() => setSectionsEditorOpen(true)}
                  >
                    <Settings2 className="h-4 w-4" />
                  </Button>
                )}
              </div>

              <TabsList className="ds-subrail tabs-scrollbar hidden h-auto w-full flex-row items-stretch gap-0 overflow-x-auto border-b-0 p-0 lg:flex lg:flex-col lg:overflow-visible">
                {canManage && subsections?.length ? (
                  <DragProvider
                    axis="vertical"
                    onDrop={handleSubsectionDrop}
                    onKeyboardMove={moveSubsectionBy}
                  >
                    {subsections.map((sub, index) => (
                      <SortableTabTrigger
                        key={sub.id}
                        id={sub.id}
                        index={index}
                        value={sub.name}
                        label={sub.name}
                        canDrag
                        className="w-full"
                        meta={<span className="shrink-0 text-[12px] font-normal text-muted-foreground">{countOf(sub.id)}</span>}
                      >
                        {sub.name}
                      </SortableTabTrigger>
                    ))}
                  </DragProvider>
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
                {/* In the rail rather than in its header, because it belongs
                    with the sections it edits. Drawn as a row like the rest,
                    held quieter so it reads as the way out of the list rather
                    than another place in it. */}
                {canManage && (
                  <button
                    type="button"
                    onClick={() => setSectionsEditorOpen(true)}
                    className="flex w-full items-center gap-1.5 px-5 py-2.5 text-left text-[13px] text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <Settings2 className="h-3 w-3 shrink-0" />
                    Edit sections
                  </button>
                )}
              </TabsList>
            </div>

            <div className="flex min-w-0 flex-col gap-8 px-9 pb-12 pt-7">

          {subsections?.map((sub) => {
            const subResources = (resources ?? [])
              .filter((r) => r.subsection_id === sub.id)
              .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

            const subFolders = (resourceFolders ?? []).filter((f) => f.subsection_id === sub.id);

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
                  // Only for the section the folder is actually in, so a stale
                  // `?folder=` cannot open something in a different tab.
                  openFolderId={searchParams.get("subsection") === sub.id ? searchParams.get("folder") : null}
                  resources={subResources}
                  folders={subFolders}
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
            </div>
          </div>
        </Tabs>

        {/* The discussion is the specialty's, not the open category's, so it
            sits below the whole grid at full width rather than inside the
            column beside the category rail. In there it was indented under a
            244px gutter that has nothing to do with it, and it changed width
            depending on which category you had open.

            Only the latest few threads: the whole board — composer, voting,
            comment trees — lives at /community/:id. */}
        <div ref={discussionRef} className="border-t-2 border-border px-9 py-8">
          <SpecialtyDiscussionPreview specialtyId={id!} specialtyName={specialty.short_name} />
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
      <SectionsEditor
        open={sectionsEditorOpen}
        onOpenChange={setSectionsEditorOpen}
        sections={(subsections ?? []).map((sub) => ({ id: sub.id, name: sub.name }))}
        countOf={countOf}
        busy={reorderSubsections.isPending || addSubsection.isPending}
        onAdd={(name) => addSubsection.mutate(name)}
        onRename={(section) => {
          setSectionsEditorOpen(false);
          setRenameSubId(section.id);
          setRenameSubName(section.name);
        }}
        onDelete={(section) => {
          setSectionsEditorOpen(false);
          const others = (subsections ?? []).filter((s) => s.id !== section.id);
          setDeleteSubId(section.id);
          setDeleteAction(others.length > 0 ? "move" : "delete");
          setMoveTargetId(others[0]?.id ?? "");
        }}
        onReorder={(ordered) => {
          const updates = ordered.map((s, i) => ({ id: s.id, sort_order: i }));
          queryClient.setQueryData(
            ["subsections", id],
            ordered.map((s, i) => ({
              ...(subsections ?? []).find((x) => x.id === s.id),
              sort_order: i,
            })),
          );
          reorderSubsections.mutate(updates);
        }}
      />

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
