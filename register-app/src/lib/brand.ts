/**
 * The few things that name this deployment. Everything is overridable from
 * .env so a fork can rebrand without touching components.
 */
export const APP_NAME = (import.meta.env.VITE_APP_NAME as string | undefined) || "The Register";

/** Who operates this deployment — named in the privacy notice and terms. */
export const OPERATOR_NAME = (import.meta.env.VITE_OPERATOR_NAME as string | undefined) || "";
export const CONTACT_EMAIL = (import.meta.env.VITE_CONTACT_EMAIL as string | undefined) || "";

/** Shown on the upgrade button, e.g. "£60 a year". The charge itself is Stripe's. */
export const PRICE_LABEL = (import.meta.env.VITE_PRICE_LABEL as string | undefined) || "";

/**
 * The sign-in providers on offer, in order. Each is a Supabase Auth provider
 * id. "NHS" is NHSmail, which is Microsoft Entra: Supabase's `azure` provider
 * pointed at the NHS tenant. See the README for why this, not NHS login or
 * CIS2.
 */
export type SignInProvider = "google" | "apple" | "azure";

const ALL: SignInProvider[] = ["google", "apple", "azure"];

export const SIGN_IN_PROVIDERS: SignInProvider[] = (() => {
  const raw = (import.meta.env.VITE_SIGN_IN_PROVIDERS as string | undefined)?.trim();
  if (!raw) return ALL;
  const wanted = raw.split(/[,\s]+/).map((p) => (p === "nhs" ? "azure" : p));
  const chosen = ALL.filter((p) => wanted.includes(p));
  return chosen.length ? chosen : ALL;
})();
