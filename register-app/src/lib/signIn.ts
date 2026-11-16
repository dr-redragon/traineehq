import { supabase } from "@/integrations/supabase/client";
import type { SignInProvider } from "@/lib/brand";
import { safeDestination } from "@/lib/safeDestination";

const NEXT_KEY = "register.signin.next";
export const DEFAULT_DESTINATION = "/registers";

/**
 * Start a provider sign-in.
 *
 * Where the person was going is kept in sessionStorage rather than in the
 * redirect URL: the browser leaves for the provider and comes back to one
 * fixed address, so only that one address has to be on Supabase's redirect
 * allow-list.
 */
export async function signInWith(provider: SignInProvider, next: string) {
  try {
    sessionStorage.setItem(NEXT_KEY, next);
  } catch { /* they land on the register list instead */ }

  const hint = (import.meta.env.VITE_NHS_DOMAIN_HINT as string | undefined) ?? "nhs.net";

  const { error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: `${window.location.origin}/auth/callback`,
      // Microsoft returns no email claim unless it is asked for, and an account
      // with no email cannot be matched to an invitation.
      ...(provider === "azure" && {
        scopes: "email",
        // Skips Microsoft's "which account?" step for NHSmail users.
        ...(hint && { queryParams: { domain_hint: hint } }),
      }),
    },
  });
  if (error) throw error;
}

/** Where to go now that sign-in has finished. Read once, then forgotten. */
export function takeDestination(): string {
  let stored: string | null = null;
  try {
    stored = sessionStorage.getItem(NEXT_KEY);
    sessionStorage.removeItem(NEXT_KEY);
  } catch { /* no storage: the default stands */ }
  return safeDestination(stored, DEFAULT_DESTINATION);
}
