import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Plus, Pencil, Trash2, Mail, Search, Archive } from "lucide-react";
import { toast } from "sonner";
import { contactCategories, obfuscateEmail } from "@/lib/contacts";
import type { Tables } from "@/integrations/supabase/types";
import type { Enums } from "@/integrations/supabase/types";

const categoryOptions: { value: Enums<"contact_category">; label: string }[] = [
  { value: "deanery", label: "Deanery / HEE Regional" },
  { value: "tpd", label: "Training Programme Director" },
  { value: "associate_dean", label: "Associate Dean" },
  { value: "educational_supervisor", label: "Educational Supervisor" },
  { value: "trainee_rep", label: "Trainee Representative" },
  { value: "royal_college", label: "Royal College / SAC" },
  { value: "trust_lead", label: "Hospital / Trust Training Lead" },
  { value: "rota_admin", label: "Rota Coordinator / Admin" },
];

const emptyForm = { name: "", role: "", category: "tpd" as Enums<"contact_category">, organisation: "", email: "", phone: "", specialty_id: "none", archived: false };

export function AdminContacts() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Tables<"contacts"> | null>(null);
  const [form, setForm] = useState(emptyForm);

  const { data: specialties } = useQuery({
    queryKey: ["specialties"],
    queryFn: async () => {
      const { data, error } = await supabase.from("specialties").select("id, short_name").order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  const { data: contacts, isLoading } = useQuery({
    queryKey: ["admin-contacts"],
    queryFn: async () => {
      // Admins can see all contacts via RLS policy
      const { data, error } = await supabase.from("contacts").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name, role: form.role, category: form.category,
        organisation: form.organisation, email: form.email,
        phone: form.phone || null, specialty_id: form.specialty_id === "none" ? null : form.specialty_id, archived: form.archived,
      };
      if (editing) {
        const { error } = await supabase.from("contacts").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("contacts").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Contact updated" : "Contact added");
      queryClient.invalidateQueries({ queryKey: ["admin-contacts"] });
      closeDialog();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("contacts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Contact deleted");
      queryClient.invalidateQueries({ queryKey: ["admin-contacts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openEdit = (c: Tables<"contacts">) => {
    setEditing(c);
    setForm({
      name: c.name, role: c.role, category: c.category, organisation: c.organisation,
      email: c.email, phone: c.phone || "", specialty_id: c.specialty_id || "none", archived: c.archived ?? false,
    });
    setDialogOpen(true);
  };

  const closeDialog = () => { setDialogOpen(false); setEditing(null); setForm(emptyForm); };

  const filtered = contacts?.filter((c) => {
    if (!showArchived && c.archived) return false;
    if (!search) return true;
    return c.name.toLowerCase().includes(search.toLowerCase()) || c.organisation.toLowerCase().includes(search.toLowerCase());
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search contacts…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
            <Switch checked={showArchived} onCheckedChange={setShowArchived} />
            Show archived
          </label>
          <Dialog open={dialogOpen} onOpenChange={(o) => { if (!o) closeDialog(); else setDialogOpen(true); }}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5"><Plus className="h-4 w-4" /> Add Contact</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>{editing ? "Edit Contact" : "Add Contact"}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Full name</Label>
                    <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Role / Title</Label>
                    <Input value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Category</Label>
                    <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v as Enums<"contact_category"> }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {categoryOptions.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Specialty (optional)</Label>
                    <Select value={form.specialty_id} onValueChange={(v) => setForm((f) => ({ ...f, specialty_id: v }))}>
                      <SelectTrigger><SelectValue placeholder="All specialties" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">All specialties</SelectItem>
                        {specialties?.map((s) => <SelectItem key={s.id} value={s.id}>{s.short_name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Organisation / Trust</Label>
                  <Input value={form.organisation} onChange={(e) => setForm((f) => ({ ...f, organisation: e.target.value }))} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Email</Label>
                    <Input value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="name@nhs.net" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Phone (optional)</Label>
                    <Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
                  </div>
                </div>
                {editing && (
                  <label className="flex items-center gap-2 text-sm">
                    <Switch checked={form.archived} onCheckedChange={(v) => setForm((f) => ({ ...f, archived: v }))} />
                    Archived
                  </label>
                )}
                <Button className="w-full" onClick={() => saveMutation.mutate()} disabled={!form.name || !form.email || saveMutation.isPending}>
                  {saveMutation.isPending ? "Saving…" : editing ? "Update Contact" : "Add Contact"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground text-center py-12">Loading…</p>
      ) : !filtered?.length ? (
        <p className="text-sm text-muted-foreground text-center py-12">No contacts found.</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {filtered.map((c) => (
            <Card key={c.id} className={c.archived ? "opacity-60" : ""}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-semibold">{c.name}</h4>
                      {c.archived && <Badge variant="secondary" className="text-[10px]">Archived</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground">{c.role}</p>
                    <p className="text-xs text-muted-foreground">{c.organisation}</p>
                    <a href={`mailto:${c.email}`} className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1 transition-colors">
                      <Mail className="h-3 w-3" /> {c.email}
                    </a>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(c)}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(c.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
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
