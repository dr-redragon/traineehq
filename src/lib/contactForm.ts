import type { Enums, Tables } from "@/integrations/supabase/types";

/** What the add / edit contact form holds, before it becomes a row. */
export interface ContactFormValues {
  name: string;
  role: string;
  category: Enums<"contact_category">;
  organisation: string;
  email: string;
  phone: string;
  /** Where the contact applies: see {@link ContactScope}. */
  scope: ContactScope;
  archived: boolean;
}

export const emptyContactValues: ContactFormValues = {
  name: "", role: "", category: "tpd", organisation: "", email: "", phone: "",
  scope: "deanery", archived: false,
};

/**
 * Where a contact applies, as one form value: the whole deanery, every
 * specialty in a school (`school:<id>`), or one specialty (its id).
 */
export type ContactScope = "deanery" | `school:${string}` | string;

export function scopeOf(contact: Pick<Tables<"contacts">, "specialty_id" | "school_id">): ContactScope {
  if (contact.specialty_id) return contact.specialty_id;
  if (contact.school_id) return `school:${contact.school_id}`;
  return "deanery";
}

/** The columns a scope is stored in. Exactly one is set, or neither for the deanery. */
export function scopeColumns(scope: ContactScope): { specialty_id: string | null; school_id: string | null } {
  if (scope === "deanery") return { specialty_id: null, school_id: null };
  if (scope.startsWith("school:")) return { specialty_id: null, school_id: scope.slice("school:".length) };
  return { specialty_id: scope, school_id: null };
}

/** Loose on purpose: catches a missing @ or domain, not every RFC corner. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function contactFormErrors(values: ContactFormValues) {
  const errors: Partial<Record<keyof ContactFormValues, string>> = {};
  if (!values.name.trim()) errors.name = "Add their name";
  if (!values.role.trim()) errors.role = "Add their role, e.g. Training Programme Director";
  if (!values.email.trim()) errors.email = "Add an email address";
  else if (!EMAIL.test(values.email.trim())) errors.email = "That doesn't look like an email address";
  return errors;
}
