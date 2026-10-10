import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ContactCard } from "@/components/ContactCard";
import { ContactFormDialog, type ContactFormValues } from "@/components/ContactFormDialog";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useUserRole } from "@/hooks/useUserRole";
import type { Tables } from "@/integrations/supabase/types";

interface SpecialtyContactsProps {
  specialty: Pick<Tables<"specialties">, "id" | "short_name" | "deanery_id">;
  contacts: Tables<"contacts">[];
  /** Edit rights *and* edit mode on, the same switch the rest of the page uses. */
  canManage: boolean;
}

/**
 * The Key Contacts tab of a specialty, with adding and editing in place.
 *
 * Contacts used to be added only from the admin panel, which a facilitator
 * cannot reach — so the people who know who this year's TPD is had to ask
 * somebody else to type it in. Whoever can edit the specialty can now do it
 * here, in the tab where the contacts are read.
 *
 * Who may change which contact mirrors the database: a facilitator looks after
 * their specialty's own contacts; the general directory (no specialty) shows on
 * every specialty page and is left to admins, so it is shown here but not
 * offered for editing to anyone else.
 */
export function SpecialtyContacts({ specialty, contacts, canManage }: SpecialtyContactsProps) {
  const queryClient = useQueryClient();
  const { data: role } = useUserRole();
  const isAdmin = role === "admin" || role === "super_admin";

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Tables<"contacts"> | null>(null);
  const [removing, setRemoving] = useState<Tables<"contacts"> | null>(null);

  const editable = (c: Tables<"contacts">) =>
    canManage && (c.specialty_id === specialty.id || isAdmin);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["contacts", specialty.id] });
    queryClient.invalidateQueries({ queryKey: ["all-contacts"] });
    queryClient.invalidateQueries({ queryKey: ["admin-contacts"] });
    queryClient.invalidateQueries({ queryKey: ["my-starred-contacts"] });
  };

  const save = useMutation({
    mutationFn: async (values: ContactFormValues) => {
      const details = {
        name: values.name, role: values.role, category: values.category,
        organisation: values.organisation, email: values.email, phone: values.phone || null,
      };
      if (editing) {
        // Where a contact lives is left alone: an admin tidying a general
        // contact from here must not pin it to this one specialty.
        const { error } = await supabase.from("contacts").update(details).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("contacts").insert({
          ...details, specialty_id: specialty.id, deanery_id: specialty.deanery_id,
        });
        if (error) throw error;
      }
    },
    onSuccess: (_, values) => {
      toast.success(editing ? `${values.name} updated` : `${values.name} added to ${specialty.short_name}`);
      refresh();
      setFormOpen(false);
      setEditing(null);
    },
    onError: (e: Error) => toast.error(e.message || "Could not save the contact"),
  });

  const remove = useMutation({
    mutationFn: async (contact: Tables<"contacts">) => {
      const { error } = await supabase.from("contacts").delete().eq("id", contact.id);
      if (error) throw error;
    },
    onSuccess: (_, contact) => {
      toast.success(`${contact.name} removed`);
      refresh();
      setRemoving(null);
    },
    onError: (e: Error) => toast.error(e.message || "Could not remove the contact"),
  });

  const openAdd = () => { setEditing(null); setFormOpen(true); };
  const openEdit = (c: Tables<"contacts">) => { setEditing(c); setFormOpen(true); };

  // The specialty's own contacts first: they are the ones this page is for,
  // and the ones an editor came here to look after.
  const ordered = [...contacts].sort((a, b) =>
    Number(a.specialty_id === null) - Number(b.specialty_id === null) || a.name.localeCompare(b.name));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-display text-lg font-extrabold tracking-tight">
          Key Contacts — {specialty.short_name}
        </h3>
        {canManage && contacts.length > 0 && (
          <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={openAdd}>
            <Plus className="h-3.5 w-3.5" /> Add contact
          </Button>
        )}
      </div>

      {!contacts.length ? (
        canManage ? (
          <button
            type="button"
            onClick={openAdd}
            className="flex w-full flex-col items-center gap-2 rounded-md border border-dashed border-border px-6 py-10 text-center transition-colors hover:border-rule hover:bg-accent"
          >
            <UserPlus className="h-6 w-6 text-rule" aria-hidden />
            <span className="text-sm font-semibold">Add the first contact for {specialty.short_name}</span>
            <span className="text-[13px] text-muted-foreground">
              Training programme directors, supervisors, trainee reps — whoever trainees should know how to reach.
            </span>
          </button>
        ) : (
          <p className="py-6 text-sm text-muted-foreground">No contacts added yet.</p>
        )
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {ordered.map((c) => (
            <ContactCard
              key={c.id}
              contact={c}
              onEdit={editable(c) ? () => openEdit(c) : undefined}
              onDelete={editable(c) ? () => setRemoving(c) : undefined}
              // While editing, say why a general contact has no edit buttons
              // — or, for an admin, that changing it changes it everywhere.
              note={canManage && c.specialty_id === null
                ? isAdmin ? "Shown on every specialty — edits apply everywhere" : "Shown on every specialty · managed by admins"
                : undefined}
            />
          ))}
        </div>
      )}

      <ContactFormDialog
        open={formOpen}
        onOpenChange={(open) => { if (!save.isPending) { setFormOpen(open); if (!open) setEditing(null); } }}
        contact={editing}
        saving={save.isPending}
        description={editing ? undefined : `They will appear on the ${specialty.short_name} page and in the Key Contacts directory.`}
        onSubmit={(values) => save.mutate(values)}
      />

      <AlertDialog open={!!removing} onOpenChange={(open) => { if (!open && !remove.isPending) setRemoving(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {removing?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              {removing?.specialty_id === null
                ? "This contact is shown on every specialty, so removing it takes it off all of them."
                : `They will no longer be listed for ${specialty.short_name}.`}
              {" "}This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={remove.isPending}
              onClick={(e) => { e.preventDefault(); if (removing) remove.mutate(removing); }}
            >
              {remove.isPending ? "Removing…" : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
