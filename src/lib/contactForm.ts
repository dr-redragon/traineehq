import type { Enums } from "@/integrations/supabase/types";

/** What the add / edit contact form holds, before it becomes a row. */
export interface ContactFormValues {
  name: string;
  role: string;
  category: Enums<"contact_category">;
  organisation: string;
  email: string;
  phone: string;
  /** "none" is the general directory, shown on every specialty. */
  specialty_id: string;
  archived: boolean;
}

export const emptyContactValues: ContactFormValues = {
  name: "", role: "", category: "tpd", organisation: "", email: "", phone: "",
  specialty_id: "none", archived: false,
};

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
