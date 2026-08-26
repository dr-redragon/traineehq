import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Plus, Pencil, Trash2, Building2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

const emptyForm = { name: "", short_name: "", slug: "", is_active: true };

export function AdminDeaneries() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState(emptyForm);

  const { data: deaneries, isLoading } = useQuery({
    queryKey: ["admin-deaneries"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("deaneries")
        .select("*")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name,
        short_name: form.short_name,
        slug: form.slug,
        is_active: form.is_active,
      };
      if (editing) {
        const { error } = await supabase.from("deaneries").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("deaneries").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Deanery updated" : "Deanery created");
      queryClient.invalidateQueries({ queryKey: ["admin-deaneries"] });
      queryClient.invalidateQueries({ queryKey: ["deaneries"] });
      closeDialog();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("deaneries").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Deanery deleted");
      queryClient.invalidateQueries({ queryKey: ["admin-deaneries"] });
      queryClient.invalidateQueries({ queryKey: ["deaneries"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openEdit = (d: any) => {
    setEditing(d);
    setForm({ name: d.name, short_name: d.short_name, slug: d.slug, is_active: d.is_active });
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditing(null);
    setForm(emptyForm);
  };

  const generateSlug = (name: string) =>
    name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Manage deaneries / regions. Each deanery gets its own specialties, contacts, and announcements.
        </p>
        <Dialog open={dialogOpen} onOpenChange={(o) => { if (!o) closeDialog(); else setDialogOpen(true); }}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5"><Plus className="h-4 w-4" /> Add Deanery</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing ? "Edit Deanery" : "New Deanery"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-1.5">
                <Label>Full Name</Label>
                <Input
                  value={form.name}
                  onChange={(e) => {
                    const name = e.target.value;
                    setForm((f) => ({
                      ...f,
                      name,
                      ...(editing ? {} : { slug: generateSlug(name), short_name: name.split(" ").map(w => w[0]).join("").toUpperCase() }),
                    }));
                  }}
                  placeholder="e.g. North West"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Short Name</Label>
                  <Input value={form.short_name} onChange={(e) => setForm((f) => ({ ...f, short_name: e.target.value }))} placeholder="e.g. NW" />
                </div>
                <div className="space-y-1.5">
                  <Label>Slug</Label>
                  <Input value={form.slug} onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))} placeholder="e.g. northwest" />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={form.is_active} onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v }))} />
                Active
              </label>
              <Button
                className="w-full"
                onClick={() => saveMutation.mutate()}
                disabled={!form.name || !form.short_name || !form.slug || saveMutation.isPending}
              >
                {saveMutation.isPending ? "Saving…" : editing ? "Update" : "Create Deanery"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground text-center py-12">Loading…</p>
      ) : !deaneries?.length ? (
        <p className="text-sm text-muted-foreground text-center py-12">No deaneries configured.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {deaneries.map((d) => (
            <Card key={d.id} className={!d.is_active ? "opacity-60" : ""}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                      <Building2 className="h-5 w-5 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-sm font-semibold truncate">{d.name}</h4>
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        <Badge variant={d.is_active ? "default" : "secondary"} className="text-[10px]">
                          {d.is_active ? "Active" : "Inactive"}
                        </Badge>
                        <span className="text-xs text-muted-foreground">{d.short_name} · /{d.slug}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(d)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(d.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
