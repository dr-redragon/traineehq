import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDeanery } from "@/contexts/DeaneryContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Plus, Copy, ChevronRight, ChevronDown, Trash2, Download, Loader2, RotateCcw, Archive } from "lucide-react";
import { getIcon } from "@/lib/iconMap";
import { IconColorPicker } from "@/components/IconColorPicker";
import { toast } from "sonner";
import { downloadResourcesAsZip } from "@/lib/resourceDownloads";
import { extractStoragePath } from "@/lib/storageUtils";

import type { TablesUpdate } from "@/integrations/supabase/types";


export function AdminSpecialties() {
  const queryClient = useQueryClient();
  const { activeDeanery, allDeaneries } = useDeanery();
  const [createOpen, setCreateOpen] = useState(false);
  const [cloneOpen, setCloneOpen] = useState(false);
  const [sourceDeaneryId, setSourceDeaneryId] = useState("");
  const [newSpec, setNewSpec] = useState({ name: "", short_name: "", slug: "", icon_name: "Stethoscope", color: "174 60% 40%" });
  const [parentId, setParentId] = useState<string>("none");
  const [expandedParents, setExpandedParents] = useState<Record<string, boolean>>({});
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);
  const [downloadingZip, setDownloadingZip] = useState(false);
  const [confirmText, setConfirmText] = useState("");


  const GRACE_PERIOD_DAYS = 30;
  const graceCutoff = () => new Date(Date.now() - GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data: allRows, isLoading } = useQuery({
    queryKey: ["admin-specialties", activeDeanery?.id],
    queryFn: async () => {
      if (!activeDeanery) return [];
      // Auto-purge anything past the grace window before listing
      await supabase
        .from("specialties")
        .delete()
        .eq("deanery_id", activeDeanery.id)
        .not("deleted_at", "is", null)
        .lt("deleted_at", graceCutoff());

      const { data, error } = await supabase
        .from("specialties")
        .select("*")
        .eq("deanery_id", activeDeanery.id)
        .order("sort_order");
      if (error) throw error;
      return data;
    },
    enabled: !!activeDeanery,
  });

  const specialties = allRows?.filter((s: any) => !s.deleted_at);
  const deletedSpecialties = (allRows ?? []).filter((s: any) => !!s.deleted_at);

  // Source deanery specialties for cloning
  const { data: sourceSpecialties } = useQuery({
    queryKey: ["clone-source-specialties", sourceDeaneryId],
    queryFn: async () => {
      if (!sourceDeaneryId) return [];
      const { data, error } = await supabase
        .from("specialties")
        .select("*")
        .eq("deanery_id", sourceDeaneryId)
        .order("sort_order");
      if (error) throw error;
      return data;
    },
    enabled: !!sourceDeaneryId,
  });

  const topLevel = specialties?.filter((s) => !s.parent_specialty_id) ?? [];
  const childrenOf = (parentId: string) =>
    specialties?.filter((s) => s.parent_specialty_id === parentId) ?? [];

  const toggleActive = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from("specialties").update({ is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-specialties"] });
      queryClient.invalidateQueries({ queryKey: ["sidebar-specialties"] });
      queryClient.invalidateQueries({ queryKey: ["my-specialties"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reorder = useMutation({
    mutationFn: async ({ id, direction }: { id: string; direction: "up" | "down" }) => {
      if (!specialties) return;
      const spec = specialties.find((s) => s.id === id);
      if (!spec) return;

      // Get siblings (same parent)
      const siblings = specialties
        .filter((s) => s.parent_specialty_id === spec.parent_specialty_id)
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

      const idx = siblings.findIndex((s) => s.id === id);
      const swapIdx = direction === "up" ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= siblings.length) return;

      const other = siblings[swapIdx];
      const tempOrder = spec.sort_order;

      await supabase.from("specialties").update({ sort_order: other.sort_order }).eq("id", spec.id);
      await supabase.from("specialties").update({ sort_order: tempOrder }).eq("id", other.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-specialties"] });
      queryClient.invalidateQueries({ queryKey: ["sidebar-specialties"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const createSpecialty = useMutation({
    mutationFn: async () => {
      if (!activeDeanery) return;
      const maxOrder = specialties?.reduce((max, s) => Math.max(max, s.sort_order ?? 0), 0) ?? 0;
      const { error } = await supabase.from("specialties").insert({
        name: newSpec.name,
        short_name: newSpec.short_name,
        slug: newSpec.slug,
        icon_name: newSpec.icon_name,
        color: newSpec.color,
        deanery_id: activeDeanery.id,
        parent_specialty_id: parentId === "none" ? null : parentId,
        sort_order: maxOrder + 1,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Specialty created");
      queryClient.invalidateQueries({ queryKey: ["admin-specialties"] });
      queryClient.invalidateQueries({ queryKey: ["sidebar-specialties"] });
      setCreateOpen(false);
      setNewSpec({ name: "", short_name: "", slug: "", icon_name: "Stethoscope", color: "174 60% 40%" });
      setParentId("none");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cloneFromDeanery = useMutation({
    mutationFn: async () => {
      if (!activeDeanery || !sourceSpecialties?.length) return;

      // Get existing slugs in target deanery to avoid duplicates
      const existingSlugs = new Set(specialties?.map((s) => s.slug) ?? []);
      const toClone = sourceSpecialties.filter((s) => !existingSlugs.has(s.slug));

      if (toClone.length === 0) {
        toast.info("All specialties from that deanery already exist here");
        return;
      }

      // Clone top-level first, then children
      const topLevel = toClone.filter((s) => !s.parent_specialty_id);
      const children = toClone.filter((s) => s.parent_specialty_id);

      // Map old IDs to new IDs for parent references
      const idMap: Record<string, string> = {};
      const maxOrder = specialties?.reduce((max, s) => Math.max(max, s.sort_order ?? 0), 0) ?? 0;

      for (let i = 0; i < topLevel.length; i++) {
        const s = topLevel[i];
        const { data, error } = await supabase.from("specialties").insert({
          name: s.name,
          short_name: s.short_name,
          slug: s.slug,
          icon_name: s.icon_name,
          color: s.color,
          deanery_id: activeDeanery.id,
          sort_order: maxOrder + i + 1,
          is_active: true,
        }).select("id").single();
        if (error) throw error;
        idMap[s.id] = data.id;
      }

      // Also map existing parent specialties in target deanery by slug
      for (const existing of (specialties ?? [])) {
        const source = sourceSpecialties.find((s) => s.slug === existing.slug);
        if (source) idMap[source.id] = existing.id;
      }

      for (let i = 0; i < children.length; i++) {
        const s = children[i];
        const newParentId = s.parent_specialty_id ? idMap[s.parent_specialty_id] : null;
        if (!newParentId) continue; // skip orphans

        const { error } = await supabase.from("specialties").insert({
          name: s.name,
          short_name: s.short_name,
          slug: s.slug,
          icon_name: s.icon_name,
          color: s.color,
          deanery_id: activeDeanery.id,
          parent_specialty_id: newParentId,
          sort_order: s.sort_order,
          is_active: true,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Specialties cloned successfully");
      queryClient.invalidateQueries({ queryKey: ["admin-specialties"] });
      queryClient.invalidateQueries({ queryKey: ["sidebar-specialties"] });
      setCloneOpen(false);
      setSourceDeaneryId("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const generateSlug = (name: string) =>
    name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

  const toggleParent = (id: string) =>
    setExpandedParents((prev) => ({ ...prev, [id]: !prev[id] }));

  const updateAppearance = useMutation({
    mutationFn: async ({ id, icon_name, color }: { id: string; icon_name?: string; color?: string }) => {
      const update: TablesUpdate<"specialties"> = {};
      if (icon_name !== undefined) update.icon_name = icon_name;
      if (color !== undefined) update.color = color;
      const { error } = await supabase.from("specialties").update(update).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-specialties"] });
      queryClient.invalidateQueries({ queryKey: ["sidebar-specialties"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Collect all specialty IDs to delete (target + its children)
  const collectSpecialtyIds = (specId: string): string[] => {
    const kids = (specialties ?? []).filter((s) => s.parent_specialty_id === specId).map((s) => s.id);
    return [specId, ...kids];
  };

  const fetchSpecialtyResources = async (specId: string) => {
    const ids = collectSpecialtyIds(specId);
    const { data: subs, error: subErr } = await supabase
      .from("subsections").select("id").in("specialty_id", ids);
    if (subErr) throw subErr;
    const subIds = (subs ?? []).map((s: any) => s.id);
    if (subIds.length === 0) return { resources: [] as any[], folders: [] as any[] };
    const [{ data: resources, error: rErr }, { data: folders, error: fErr }] = await Promise.all([
      supabase.from("resources").select("*").in("subsection_id", subIds),
      supabase.from("resource_folders").select("id,name,subsection_id").in("subsection_id", subIds),
    ]);
    if (rErr) throw rErr;
    if (fErr) throw fErr;
    return { resources: resources ?? [], folders: folders ?? [] };
  };

  const handleDownloadSpecialtyZip = async (spec: any) => {
    try {
      setDownloadingZip(true);
      const { resources, folders } = await fetchSpecialtyResources(spec.id);
      const folderMap = new Map<string, string>(folders.map((f: any) => [f.id, f.name]));
      const items = resources
        .filter((r: any) => r.file_url)
        .map((r: any) => ({
          resource: r,
          folderName: r.folder_id ? folderMap.get(r.folder_id) ?? null : null,
        }));
      if (items.length === 0) {
        toast.info("No downloadable files in this specialty");
        return;
      }
      const result = await downloadResourcesAsZip(items, spec.short_name || spec.name || "specialty");
      toast.success(`Downloaded ${result.downloaded} file${result.downloaded === 1 ? "" : "s"}${result.skippedCount ? ` (${result.skippedCount} skipped)` : ""}`);
    } catch (e: any) {
      toast.error(e?.message || "Download failed");
    } finally {
      setDownloadingZip(false);
    }
  };

  const deleteSpecialty = useMutation({
    mutationFn: async (spec: any) => {
      // Soft-delete: mark this specialty and any child specialties as deleted.
      const ids = collectSpecialtyIds(spec.id);
      const { error } = await supabase
        .from("specialties")
        .update({ deleted_at: new Date().toISOString() })
        .in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(`Specialty moved to trash — restorable for ${GRACE_PERIOD_DAYS} days`);
      queryClient.invalidateQueries({ queryKey: ["admin-specialties"] });
      queryClient.invalidateQueries({ queryKey: ["sidebar-specialties"] });
      queryClient.invalidateQueries({ queryKey: ["my-specialties"] });
      setDeleteTarget(null);
      setConfirmText("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const restoreSpecialty = useMutation({
    mutationFn: async (spec: any) => {
      const ids = collectSpecialtyIds(spec.id);
      const { error } = await supabase
        .from("specialties")
        .update({ deleted_at: null })
        .in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Specialty restored");
      queryClient.invalidateQueries({ queryKey: ["admin-specialties"] });
      queryClient.invalidateQueries({ queryKey: ["sidebar-specialties"] });
      queryClient.invalidateQueries({ queryKey: ["my-specialties"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const purgeSpecialty = useMutation({
    mutationFn: async (spec: any) => {
      const ids = collectSpecialtyIds(spec.id);

      const { resources } = await fetchSpecialtyResources(spec.id);
      const storagePaths = resources
        .map((r: any) => (r.file_url ? extractStoragePath(r.file_url) : null))
        .filter((p: string | null): p is string => !!p);

      if (storagePaths.length > 0) {
        const chunkSize = 100;
        for (let i = 0; i < storagePaths.length; i += chunkSize) {
          const chunk = storagePaths.slice(i, i + chunkSize);
          const { error } = await supabase.storage.from("resources").remove(chunk);
          if (error) console.warn("Storage cleanup error:", error.message);
        }
      }

      const childIds = ids.filter((id) => id !== spec.id);
      if (childIds.length > 0) {
        const { error } = await supabase.from("specialties").delete().in("id", childIds);
        if (error) throw error;
      }
      const { error } = await supabase.from("specialties").delete().eq("id", spec.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Specialty permanently deleted");
      queryClient.invalidateQueries({ queryKey: ["admin-specialties"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const daysRemaining = (deletedAt: string) => {
    const diffMs = new Date(deletedAt).getTime() + GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000 - Date.now();
    return Math.max(0, Math.ceil(diffMs / (24 * 60 * 60 * 1000)));
  };

  const otherDeaneries = allDeaneries.filter((d) => d.id !== activeDeanery?.id);


  const renderSpecialtyRow = (spec: any, isChild = false) => {
    const color = spec.color ?? "174 60% 40%";
    const children = childrenOf(spec.id);
    const isExpanded = expandedParents[spec.id] ?? false;

    return (
      <div key={spec.id}>
        <Card className={`${!spec.is_active ? "opacity-50" : ""} ${isChild ? "ml-8 border-l-2 border-muted" : ""}`}>
          <CardContent className="p-3 flex items-center gap-3">
            <IconColorPicker
              iconName={spec.icon_name ?? "Stethoscope"}
              color={color}
              onChangeIcon={(icon) => updateAppearance.mutate({ id: spec.id, icon_name: icon })}
              onChangeColor={(c) => updateAppearance.mutate({ id: spec.id, color: c })}
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium truncate">{spec.short_name}</span>
                {!spec.is_active && <Badge variant="secondary" className="text-[10px]">Inactive</Badge>}
                {isChild && <Badge variant="outline" className="text-[10px]">Subspecialty</Badge>}
              </div>
              <p className="text-xs text-muted-foreground truncate">{spec.name}</p>
            </div>

            {!isChild && children.length > 0 && (
              <Button variant="ghost" size="sm" className="h-7 px-2 gap-1 text-xs" onClick={() => toggleParent(spec.id)}>
                {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                {children.length} sub
              </Button>
            )}

            <div className="flex items-center gap-2 shrink-0">
              <div className="flex flex-col gap-0.5">
                <button
                  className="text-muted-foreground hover:text-foreground text-xs px-1"
                  onClick={() => reorder.mutate({ id: spec.id, direction: "up" })}
                >▲</button>
                <button
                  className="text-muted-foreground hover:text-foreground text-xs px-1"
                  onClick={() => reorder.mutate({ id: spec.id, direction: "down" })}
                >▼</button>
              </div>
              <Switch
                checked={spec.is_active}
                onCheckedChange={(v) => toggleActive.mutate({ id: spec.id, is_active: v })}
              />
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                onClick={() => { setDeleteTarget(spec); setConfirmText(""); }}
                title="Delete specialty"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>

          </CardContent>
        </Card>

        {!isChild && isExpanded && children.length > 0 && (
          <div className="space-y-1.5 mt-1.5">
            {children.map((child) => renderSpecialtyRow(child, true))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">
            Manage specialties for <span className="font-medium text-foreground">{activeDeanery?.name ?? "—"}</span>.
            Toggle on/off and reorder.
          </p>
        </div>
        <div className="flex gap-2">
          {otherDeaneries.length > 0 && (
            <Dialog open={cloneOpen} onOpenChange={setCloneOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5">
                  <Copy className="h-4 w-4" /> Copy from Deanery
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Copy Specialties from Another Deanery</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-2">
                  <p className="text-sm text-muted-foreground">
                    This will copy all specialties from the selected deanery that don't already exist in {activeDeanery?.name}.
                  </p>
                  <div className="space-y-1.5">
                    <Label>Source Deanery</Label>
                    <Select value={sourceDeaneryId} onValueChange={setSourceDeaneryId}>
                      <SelectTrigger><SelectValue placeholder="Select deanery…" /></SelectTrigger>
                      <SelectContent>
                        {otherDeaneries.map((d) => (
                          <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {sourceSpecialties && sourceSpecialties.length > 0 && (
                    <div className="text-sm text-muted-foreground">
                      {sourceSpecialties.filter((s) => !s.parent_specialty_id).length} specialties and{" "}
                      {sourceSpecialties.filter((s) => s.parent_specialty_id).length} subspecialties available to copy.
                    </div>
                  )}
                  <Button
                    className="w-full"
                    onClick={() => cloneFromDeanery.mutate()}
                    disabled={!sourceDeaneryId || cloneFromDeanery.isPending}
                  >
                    {cloneFromDeanery.isPending ? "Copying…" : "Copy Specialties"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          )}

          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5"><Plus className="h-4 w-4" /> New Specialty</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Specialty</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="space-y-1.5">
                  <Label>Full Name</Label>
                  <Input
                    value={newSpec.name}
                    onChange={(e) => {
                      const name = e.target.value;
                      setNewSpec((f) => ({
                        ...f,
                        name,
                        slug: generateSlug(name),
                        short_name: f.short_name || "",
                      }));
                    }}
                    placeholder="e.g. General Surgery"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Short Name</Label>
                    <Input
                      value={newSpec.short_name}
                      onChange={(e) => setNewSpec((f) => ({ ...f, short_name: e.target.value }))}
                      placeholder="e.g. Gen Surg"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Slug</Label>
                    <Input
                      value={newSpec.slug}
                      onChange={(e) => setNewSpec((f) => ({ ...f, slug: e.target.value }))}
                      placeholder="e.g. general-surgery"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Icon & Color</Label>
                  <div className="flex items-center gap-3">
                    <IconColorPicker
                      iconName={newSpec.icon_name}
                      color={newSpec.color}
                      onChangeIcon={(icon) => setNewSpec((f) => ({ ...f, icon_name: icon }))}
                      onChangeColor={(c) => setNewSpec((f) => ({ ...f, color: c }))}
                    />
                    <span className="text-xs text-muted-foreground">Click to change</span>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Parent Specialty (optional)</Label>
                  <Select value={parentId} onValueChange={setParentId}>
                    <SelectTrigger><SelectValue placeholder="None (top-level)" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None (top-level)</SelectItem>
                      {topLevel.map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.short_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  className="w-full"
                  onClick={() => createSpecialty.mutate()}
                  disabled={!newSpec.name || !newSpec.short_name || !newSpec.slug || createSpecialty.isPending}
                >
                  {createSpecialty.isPending ? "Creating…" : "Create Specialty"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground text-center py-12">Loading…</p>
      ) : !specialties?.length ? (
        <div className="text-center py-12 space-y-3">
          <p className="text-sm text-muted-foreground">No specialties configured for this deanery.</p>
          {otherDeaneries.length > 0 && (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setCloneOpen(true)}>
              <Copy className="h-4 w-4" /> Copy from another deanery
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-1.5">
          {topLevel.map((spec) => renderSpecialtyRow(spec))}
        </div>
      )}

      {deletedSpecialties.length > 0 && (
        <div className="space-y-2 pt-4 border-t">
          <div className="flex items-center gap-2">
            <Archive className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Recently deleted</h3>
            <Badge variant="secondary" className="text-[10px]">{deletedSpecialties.length}</Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Deleted specialties are kept for {GRACE_PERIOD_DAYS} days before permanent removal. Restore or purge below.
          </p>
          <div className="space-y-1.5">
            {deletedSpecialties.map((spec: any) => {
              const days = daysRemaining(spec.deleted_at);
              return (
                <Card key={spec.id} className="opacity-80">
                  <CardContent className="p-3 flex items-center gap-3">
                    <div
                      className="h-9 w-9 rounded-md flex items-center justify-center shrink-0"
                      style={{ backgroundColor: `hsl(${spec.color ?? "174 60% 40%"} / 0.15)` }}
                    >
                      {(() => { const Icon = getIcon(spec.icon_name ?? "Stethoscope"); return <Icon className="h-4 w-4" style={{ color: `hsl(${spec.color ?? "174 60% 40%"})` }} />; })()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">{spec.short_name}</span>
                        {spec.parent_specialty_id && <Badge variant="outline" className="text-[10px]">Sub</Badge>}
                        <Badge variant="secondary" className="text-[10px]">
                          {days > 0 ? `${days}d left` : "Purging soon"}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        Deleted {new Date(spec.deleted_at).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 gap-1.5 text-xs"
                        disabled={restoreSpecialty.isPending}
                        onClick={() => restoreSpecialty.mutate(spec)}
                      >
                        <RotateCcw className="h-3.5 w-3.5" /> Restore
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        disabled={purgeSpecialty.isPending}
                        onClick={() => {
                          if (confirm(`Permanently delete "${spec.short_name}"? This cannot be undone.`)) {
                            purgeSpecialty.mutate(spec);
                          }
                        }}
                        title="Delete permanently now"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      <Dialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) { setDeleteTarget(null); setConfirmText(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" /> Delete specialty
            </DialogTitle>
          </DialogHeader>
          {deleteTarget && (
            <div className="space-y-4 pt-2 text-sm">
              <p>
                You are about to delete{" "}
                <span className="font-semibold">{deleteTarget.short_name}</span>
                {" "}from <span className="font-medium">{activeDeanery?.name}</span>.
              </p>
              <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 space-y-1.5 text-xs">
                <p className="font-medium text-amber-700 dark:text-amber-400">
                  Grace period: {GRACE_PERIOD_DAYS} days
                </p>
                <p className="text-muted-foreground">
                  The specialty (and any subspecialties beneath it) will be hidden from trainees, facilitators, and the public site immediately, but kept in a
                  <span className="font-medium"> Recently deleted </span>
                  list so an admin can restore it. After {GRACE_PERIOD_DAYS} days it — along with all sections, folders, resources, and uploaded files — is permanently purged.
                </p>
              </div>

              <div className="rounded-md border bg-muted/30 p-3 space-y-2">
                <p className="text-xs font-medium">Optional: download a backup first</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full gap-2"
                  disabled={downloadingZip}
                  onClick={() => handleDownloadSpecialtyZip(deleteTarget)}
                >
                  {downloadingZip ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Preparing ZIP…</>
                  ) : (
                    <><Download className="h-4 w-4" /> Download all contents as ZIP</>
                  )}
                </Button>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">
                  Type <span className="font-mono font-semibold">{deleteTarget.short_name}</span> to confirm
                </Label>
                <Input
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder={deleteTarget.short_name}
                />
              </div>

              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => { setDeleteTarget(null); setConfirmText(""); }}>
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  disabled={confirmText !== deleteTarget.short_name || deleteSpecialty.isPending || downloadingZip}
                  onClick={() => deleteSpecialty.mutate(deleteTarget)}
                  className="gap-2"
                >
                  {deleteSpecialty.isPending ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Deleting…</>
                  ) : (
                    <><Trash2 className="h-4 w-4" /> Move to trash</>
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
