import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Plus, Pencil, Trash2, Mail, Search, Archive } from "lucide-react";
import { toast } from "sonner";
import { useDeanery } from "@/contexts/DeaneryContext";
import { ContactFormDialog, type ContactFormValues } from "@/components/ContactFormDialog";
import type { Tables } from "@/integrations/supabase/types";
import { scopeColumns } from "@/lib/contactForm";
import { useSchoolsReady } from "@/hooks/useSchoolsReady";


export function AdminContacts() {
  const queryClient = useQueryClient();
  const { activeDeanery } = useDeanery();
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Tables<"contacts"> | null>(null);

  const { data: specialties } = useQuery({
    queryKey: ["specialties"],
    queryFn: async () => {
      const { data, error } = await supabase.from("specialties").select("id, short_name").order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  const schoolsReady = useSchoolsReady();
  const { data: schools } = useQuery({
    queryKey: ["schools", activeDeanery?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("schools").select("id, name").eq("deanery_id", activeDeanery!.id).order("sort_order");
      if (error) throw error;
      return data;
    },
    enabled: !!activeDeanery && !!schoolsReady,
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
    mutationFn: async (form: ContactFormValues) => {
      const payload = {
        name: form.name, role: form.role, category: form.category,
        organisation: form.organisation, email: form.email,
        phone: form.phone || null, archived: form.archived,
        // Without the schools migration there is no school_id column to write.
        ...(schoolsReady ? scopeColumns(form.scope) : { specialty_id: scopeColumns(form.scope).specialty_id }),
        deanery_id: activeDeanery?.id ?? null,
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
    setDialogOpen(true);
  };

  // Where each contact shows, so a deanery-wide or school contact is not
  // mistaken for one specialty's.
  const scopeLabel = (c: Tables<"contacts">) => {
    if (c.specialty_id) return specialties?.find((s) => s.id === c.specialty_id)?.short_name ?? "Specialty";
    if (c.school_id) return schools?.find((s) => s.id === c.school_id)?.name ?? "School";
    return "Whole deanery";
  };

  const closeDialog = () => { setDialogOpen(false); setEditing(null); };

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
          <Button size="sm" className="gap-1.5" onClick={() => { setEditing(null); setDialogOpen(true); }}>
            <Plus className="h-4 w-4" /> Add Contact
          </Button>
          <ContactFormDialog
            open={dialogOpen}
            onOpenChange={(o) => { if (!o) closeDialog(); else setDialogOpen(true); }}
            contact={editing}
            saving={saveMutation.isPending}
            specialties={specialties ?? []}
            schools={schools ?? []}
            allowArchive
            onSubmit={(values) => saveMutation.mutate(values)}
          />
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
                      <Badge variant="outline" className="text-[10px]">{scopeLabel(c)}</Badge>
                      {c.archived && <Badge variant="secondary" className="text-[10px]">Archived</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground">{c.role}</p>
                    <p className="text-xs text-muted-foreground">{c.organisation}</p>
                    <a href={`mailto:${c.email}`} className="text-xs text-muted-foreground hover:text-accent-deep flex items-center gap-1 transition-colors">
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
