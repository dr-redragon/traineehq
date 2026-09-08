// Delete the caller's own account, for real.
//
// Deleting the `profiles` row — which is all the app could do from the browser,
// because row-level security is the only authority a client holds — left the
// `auth.users` row behind. The person could still sign in, landing in a
// half-deleted state with no profile, and the GDPR copy on the profile page
// promised them otherwise. Removing an auth user needs the service role, and
// the service role cannot go in a client bundle, so it needs a function.
//
// THE RULE THIS FILE EXISTS TO ENFORCE: it deletes the caller, and only ever
// the caller. The account to delete is taken from the verified JWT and never
// from the request body, so there is no id for anybody to substitute. Do not
// add a parameter for it — an admin deleting somebody else belongs in its own
// function, with its own authorisation.
//
// Everything personal cascades from auth.users: profile, roles, bookmarks,
// discussions and comments, register membership, preferences. Authored library
// content — resources, announcements, registers created — is ON DELETE SET
// NULL, so it stays for the people relying on it while ceasing to name anyone.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    if (!token) return json({ error: "Not authenticated" }, 401);

    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    const caller = userData?.user;
    if (userErr || !caller) return json({ error: "Not authenticated" }, 401);

    // Refuse to leave the platform with nobody who can administer it. Deleting
    // the last super_admin is unrecoverable from inside the app: there would be
    // no one able to grant the role back.
    const { data: callerRoles } = await admin
      .from("user_roles").select("role").eq("user_id", caller.id);

    if ((callerRoles ?? []).some((r: { role: string }) => r.role === "super_admin")) {
      const { count } = await admin
        .from("user_roles")
        .select("user_id", { count: "exact", head: true })
        .eq("role", "super_admin");

      if ((count ?? 0) <= 1) {
        return json({
          error:
            "You are the only super admin. Give somebody else that role first, " +
            "or your deanery would be left with nobody who can administer the site.",
        }, 409);
      }
    }

    const { error: deleteErr } = await admin.auth.admin.deleteUser(caller.id);
    if (deleteErr) {
      console.error("delete-account failed:", deleteErr);
      return json({ error: "Could not delete the account. Please try again." }, 500);
    }

    return json({ success: true });
  } catch (error) {
    console.error("delete-account error:", error);
    return json({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});
