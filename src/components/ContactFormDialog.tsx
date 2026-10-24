import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { contactCategories } from "@/lib/contacts";
import type { Enums, Tables } from "@/integrations/supabase/types";
import { contactFormErrors, emptyContactValues, scopeOf, type ContactFormValues } from "@/lib/contactForm";

export type { ContactFormValues };

interface ContactFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The contact being edited, or null to add a new one. */
  contact: Tables<"contacts"> | null;
  onSubmit: (values: ContactFormValues) => void;
  saving?: boolean;
  /** Under the title, e.g. "Shown on the ENT page". */
  description?: string;
  /**
   * Offer a choice of where the contact applies: the whole deanery, a school
   * or one specialty. The admin panel files contacts anywhere; on a
   * specialty's own page the specialty is already decided, so it is left out.
   */
  specialties?: { id: string; short_name: string }[];
  /** Schools offered alongside the specialties, e.g. the School of Surgery. */
  schools?: { id: string; name: string }[];
  /** Offer the archive switch when editing. Admin panel only. */
  allowArchive?: boolean;
}

/**
 * The one form for adding or editing a key contact.
 *
 * Errors are held back until the first attempt to save, so the form does not
 * open covered in red, and then follow every keystroke so a fix clears its
 * own message straight away.
 */
export function ContactFormDialog({
  open, onOpenChange, contact, onSubmit, saving, description, specialties, schools, allowArchive,
}: ContactFormDialogProps) {
  const [values, setValues] = useState<ContactFormValues>(emptyContactValues);
  const [attempted, setAttempted] = useState(false);

  // Fresh each time it opens: editing one contact and then adding another
  // must not start the second from the first one's details.
  useEffect(() => {
    if (!open) return;
    setAttempted(false);
    setValues(contact ? {
      name: contact.name, role: contact.role, category: contact.category,
      organisation: contact.organisation, email: contact.email, phone: contact.phone ?? "",
      scope: scopeOf(contact), archived: contact.archived ?? false,
    } : emptyContactValues);
  }, [open, contact]);

  const errors = attempted ? contactFormErrors(values) : {};
  const set = <K extends keyof ContactFormValues>(key: K, value: ContactFormValues[K]) =>
    setValues((v) => ({ ...v, [key]: value }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setAttempted(true);
    if (Object.keys(contactFormErrors(values)).length) return;
    onSubmit({
      ...values,
      name: values.name.trim(), role: values.role.trim(), organisation: values.organisation.trim(),
      email: values.email.trim(), phone: values.phone.trim(),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{contact ? "Edit contact" : "Add a contact"}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <form onSubmit={submit} noValidate className="space-y-4 pt-1">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="contact-name" label="Full name" error={errors.name}>
              <Input
                id="contact-name" autoFocus value={values.name} placeholder="e.g. Dr Priya Raghavan"
                onChange={(e) => set("name", e.target.value)} aria-invalid={!!errors.name}
              />
            </Field>
            <Field id="contact-role" label="Role / title" error={errors.role}>
              <Input
                id="contact-role" value={values.role} placeholder="e.g. Training Programme Director"
                onChange={(e) => set("role", e.target.value)} aria-invalid={!!errors.role}
              />
            </Field>
          </div>

          <div className={specialties ? "grid gap-3 sm:grid-cols-2" : ""}>
            <Field id="contact-category" label="Type of contact">
              <Select value={values.category} onValueChange={(v) => set("category", v as Enums<"contact_category">)}>
                <SelectTrigger id="contact-category"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {contactCategories.map((c) => (
                    <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            {specialties && (
              <Field id="contact-scope" label="Applies to">
                <Select value={values.scope} onValueChange={(v) => set("scope", v)}>
                  <SelectTrigger id="contact-scope"><SelectValue placeholder="Whole deanery" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="deanery">Whole deanery</SelectItem>
                    {!!schools?.length && (
                      <SelectGroup>
                        <SelectLabel>Schools</SelectLabel>
                        {schools.map((s) => <SelectItem key={s.id} value={`school:${s.id}`}>{s.name}</SelectItem>)}
                      </SelectGroup>
                    )}
                    {!!specialties.length && (
                      <SelectGroup>
                        <SelectLabel>Specialties</SelectLabel>
                        {specialties.map((s) => <SelectItem key={s.id} value={s.id}>{s.short_name}</SelectItem>)}
                      </SelectGroup>
                    )}
                  </SelectContent>
                </Select>
              </Field>
            )}
          </div>

          <Field id="contact-organisation" label="Organisation / trust" optional>
            <Input
              id="contact-organisation" value={values.organisation} placeholder="e.g. Royal Liverpool Hospital"
              onChange={(e) => set("organisation", e.target.value)}
            />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="contact-email" label="Email" error={errors.email}>
              <Input
                id="contact-email" type="email" inputMode="email" autoComplete="off"
                value={values.email} placeholder="name@nhs.net"
                onChange={(e) => set("email", e.target.value)} aria-invalid={!!errors.email}
              />
            </Field>
            <Field id="contact-phone" label="Phone" optional>
              <Input
                id="contact-phone" type="tel" inputMode="tel" value={values.phone}
                placeholder="e.g. 0151 123 4567" onChange={(e) => set("phone", e.target.value)}
              />
            </Field>
          </div>

          {contact && allowArchive && (
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={values.archived} onCheckedChange={(v) => set("archived", v)} />
              Archived
            </label>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : contact ? "Save changes" : "Add contact"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  id, label, error, optional, children,
}: {
  id: string;
  label: string;
  error?: string;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>
        {label}
        {optional && <span className="ml-1 font-normal text-muted-foreground">(optional)</span>}
      </Label>
      {children}
      {error && <p className="text-[12.5px] text-destructive" role="alert">{error}</p>}
    </div>
  );
}
