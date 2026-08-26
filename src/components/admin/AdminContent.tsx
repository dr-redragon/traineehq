import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Plus, Pencil, Trash2, FileText, Video, LinkIcon, BookOpen, CheckSquare, FolderOpen, Presentation } from "lucide-react";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";

const typeIcons: Record<string, typeof FileText> = {
  pdf: FileText, document: BookOpen, video: Video, link: LinkIcon,
  presentation: Presentation, checklist: CheckSquare, folder: FolderOpen,
};
const resourceTypes = ["pdf", "document", "video", "link", "presentation", "checklist", "folder"] as const;

export function AdminContent() {
  const queryClient = useQueryClient();
  const [selectedSpecialty, setSelectedSpecialty] = useState<string>("");
  const [selectedSubsection, setSelectedSubsection] = useState<string>("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Tables<"resources"> | null>(null);
  const [form, setForm] = useState({ title: "", description: "", resource_type: "document" as string, external_url: "" });

  const { data: specialties } = useQuery({
    queryKey: ["specialties"],
    queryFn: async () => {
      const { data, error } = await supabase.from("specialties").select("*").order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  const { data: subsections } = useQuery({
    queryKey: ["subsections", selectedSpecialty],
    queryFn: async () => {
      if (!selectedSpecialty) return [];
      const { data, error } = await supabase.from("subsections").select("*").eq("specialty_id", selectedSpecialty).order("sort_order");
      if (error) throw error;
      return data;
    },
    enabled: !!selectedSpecialty,
  });

  const { data: resources, isLoading } = useQuery({
    queryKey: ["resources", selectedSubsection],
    queryFn: async () => {
      if (!selectedSubsection) return [];
      const { data, error } = await supabase.from("resources").select("*").eq("subsection_id", selectedSubsection).order("sort_order");
      if (error) throw error;
      return data;
    },
    enabled: !!selectedSubsection,
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (editing) {
        const { error } = await supabase.from("resources").update({
          title: form.title, description: form.description,
          resource_type: form.resource_type as Tables<"resources">["resource_type"],
          external_url: form.external_url || null,
        }).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("resources").insert({
          subsection_id: selectedSubsection,
          title: form.title, description: form.description,
          resource_type: form.resource_type as Tables<"resources">["resource_type"],
          external_url: form.external_url || null,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Resource updated" : "Resource added");
      queryClient.invalidateQueries({ queryKey: ["resources", selectedSubsection] });
      closeDialog();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("resources").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Resource deleted");
      queryClient.invalidateQueries({ queryKey: ["resources", selectedSubsection] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openEdit = (r: Tables<"resources">) => {
    setEditing(r);
    setForm({ title: r.title, description: r.description || "", resource_type: r.resource_type, external_url: r.external_url || "" });
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditing(null);
    setForm({ title: "", description: "", resource_type: "document", external_url: "" });
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="space-y-1.5 flex-1">
          <Label className="text-xs text-muted-foreground">Specialty</Label>
          <Select value={selectedSpecialty} onValueChange={(v) => { setSelectedSpecialty(v); setSelectedSubsection(""); }}>
            <SelectTrigger><SelectValue placeholder="Select specialty…" /></SelectTrigger>
            <SelectContent>
              {specialties?.map((s) => <SelectItem key={s.id} value={s.id}>{s.short_name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5 flex-1">
          <Label className="text-xs text-muted-foreground">Subsection</Label>
          <Select value={selectedSubsection} onValueChange={setSelectedSubsection} disabled={!selectedSpecialty}>
            <SelectTrigger><SelectValue placeholder="Select subsection…" /></SelectTrigger>
            <SelectContent>
              {subsections?.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-end">
          <Dialog open={dialogOpen} onOpenChange={(o) => { if (!o) closeDialog(); else setDialogOpen(true); }}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5" disabled={!selectedSubsection}>
                <Plus className="h-4 w-4" /> Add Resource
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editing ? "Edit Resource" : "Add Resource"}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="space-y-1.5">
                  <Label>Title</Label>
                  <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>Description</Label>
                  <Textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={3} />
                </div>
                <div className="space-y-1.5">
                  <Label>Type</Label>
                  <Select value={form.resource_type} onValueChange={(v) => setForm((f) => ({ ...f, resource_type: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {resourceTypes.map((t) => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>External URL (optional)</Label>
                  <Input value={form.external_url} onChange={(e) => setForm((f) => ({ ...f, external_url: e.target.value }))} placeholder="https://…" />
                </div>
                <Button className="w-full" onClick={() => saveMutation.mutate()} disabled={!form.title || saveMutation.isPending}>
                  {saveMutation.isPending ? "Saving…" : editing ? "Update Resource" : "Add Resource"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Resource list */}
      {!selectedSubsection ? (
        <p className="text-sm text-muted-foreground text-center py-12">Select a specialty and subsection to manage resources.</p>
      ) : isLoading ? (
        <p className="text-sm text-muted-foreground text-center py-12">Loading…</p>
      ) : !resources?.length ? (
        <p className="text-sm text-muted-foreground text-center py-12">No resources in this subsection yet.</p>
      ) : (
        <div className="space-y-2">
          {resources.map((r) => {
            const Icon = typeIcons[r.resource_type] || FileText;
            return (
              <Card key={r.id} className="hover:shadow-sm transition-shadow">
                <CardContent className="flex items-center gap-4 p-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-secondary">
                    <Icon className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-medium">{r.title}</h4>
                    {r.description && <p className="text-xs text-muted-foreground line-clamp-1">{r.description}</p>}
                  </div>
                  <Badge variant="secondary" className="text-[10px] shrink-0">{r.resource_type.toUpperCase()}</Badge>
                  <div className="flex gap-1 shrink-0">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(r.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
