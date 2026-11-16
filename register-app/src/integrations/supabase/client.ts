import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

/** False until .env names a Supabase project; the app says so instead of crashing. */
export const isConfigured = !!SUPABASE_URL && !!SUPABASE_KEY;

export const supabase = createClient(
  SUPABASE_URL || "http://localhost:54321",
  SUPABASE_KEY || "not-configured",
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      // The provider sends people back with a ?code= to exchange for a session.
      flowType: "pkce",
      detectSessionInUrl: true,
    },
  },
);
