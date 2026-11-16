// The few things every function here does the same way: CORS, JSON answers,
// a service-role client, and working out who is calling.
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

/** Bypasses row-level security. Every rule RLS would apply must be re-checked in code. */
export function service(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

export interface Caller { id: string; email: string | null; }

/** The signed-in user behind this request, verified with the auth server. */
export async function caller(req: Request, db: SupabaseClient): Promise<Caller | null> {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  const { data, error } = await db.auth.getUser(token);
  return error || !data?.user ? null : { id: data.user.id, email: data.user.email ?? null };
}

/**
 * Where to send the browser back to. Taken from the environment, never from
 * the request: otherwise a caller could have Stripe, or an email this service
 * sends, point at a site of their choosing.
 */
export function appBaseUrl(): string {
  return (Deno.env.get("APP_BASE_URL") || "http://localhost:8080").replace(/\/+$/, "");
}
