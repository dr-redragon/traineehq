import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const RESEND_API = "https://api.resend.com/emails";
// The address Resend sends from. Until a domain is verified at
// resend.com/domains, onboarding@resend.dev only delivers to the Resend
// account's own address and refuses every other recipient with a 403 — so set
// RESEND_FROM to an address on the verified domain ("HST Training Hub
// <noreply@example.nhs.uk>") and every function picks it up with no code change.
// Declared per function rather than shared, so each one deploys on its own.
const FROM_EMAIL = Deno.env.get("RESEND_FROM") ??
  "HST Training Hub <onboarding@resend.dev>";

// Where replies land. The sender above is a no-reply address with no mailbox
// behind it, so without this a trainee replying to their certificate gets a
// bounce. A reply-to is not a sender: it can be any ordinary mailbox — NHS,
// Gmail, anything — no matter which domain is verified in Resend. Comma- or
// space-separated; unset means no Reply-To header at all.
const REPLY_TO = (Deno.env.get("RESEND_REPLY_TO") ?? "")
  .split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
const replyTo = REPLY_TO.length ? { reply_to: REPLY_TO } : {};

type RoleName = "super_admin" | "admin" | "facilitator" | "trainee";

// Where a password set-up link may send somebody once they have used it. The
// caller chooses the path; the origin has to be the app's own, so the hub's
// sender cannot be made to mail a link that lands somewhere else.
const APP_BASE_URL = (Deno.env.get("APP_BASE_URL") || "https://traineehq.com").replace(/\/+$/, "");

function safeRedirect(requested: unknown): string | undefined {
  if (typeof requested !== "string" || !requested) return undefined;
  try {
    const url = new URL(requested);
    return url.origin === new URL(APP_BASE_URL).origin ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

/** Escape anything interpolated into an email body. */
function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/**
 * The auth account for an address, if there is one. listUsers() is paginated
 * (50 a page by default); reading only the first page misses everybody after
 * it, and the createUser that follows then fails as a duplicate.
 */
// deno-lint-ignore no-explicit-any
async function findUserByEmail(admin: any, email: string): Promise<{ id: string } | null> {
  const perPage = 1000;
  for (let page = 1; page <= 100; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(`Could not look up accounts: ${error.message}`);
    const users: { id: string; email?: string }[] = data?.users ?? [];
    const found = users.find((u) => u.email?.toLowerCase() === email);
    if (found) return { id: found.id };
    if (users.length < perPage) return null;
  }
  throw new Error("Too many accounts to search");
}

function inviteHtml(name: string, roleLabel: string, link: string) {
  return `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px">
      <h2 style="color:#1a1a2e;margin-bottom:16px">You've been invited</h2>
      <p style="color:#4a4a5a;line-height:1.6">Hi ${esc(name) || "there"},</p>
      <p style="color:#4a4a5a;line-height:1.6">
        You've been invited to the <strong>HST Training Hub</strong> as <strong>${esc(roleLabel)}</strong>.
      </p>
      <div style="text-align:center;margin:28px 0">
        <a href="${esc(link)}" style="display:inline-block;background:#1a1a2e;color:#ffffff;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">
          Set Your Password
        </a>
      </div>
      <p style="color:#8a8a9a;font-size:13px">If the link expires, use "Forgot password" on the login page.</p>
      <p style="color:#8a8a9a;font-size:13px;margin-top:32px">— HST Training Hub</p>
    </div>`;
}

async function sendEmail(to: string, subject: string, html: string) {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) throw new Error("RESEND_API_KEY is not configured");
  const res = await fetch(RESEND_API, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM_EMAIL, to: [to], subject, html, ...replyTo }),
  });
  if (!res.ok) throw new Error(`Resend API error [${res.status}]: ${await res.text()}`);
  return res.json();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // --- Authorise caller ---
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");
    if (!token) return json({ error: "Not authenticated" }, 401);

    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    const caller = userData?.user;
    if (userErr || !caller) return json({ error: "Not authenticated" }, 401);

    const { data: callerRoles } = await admin
      .from("user_roles")
      .select("role, deanery_id")
      .eq("user_id", caller.id);

    // The same model the RLS policies enforce (20261011150000): an admin of a
    // deanery acts within it; a global admin (no deanery) across all of them;
    // only a super admin mints global or super admins. This function runs under
    // the service role, so those rules are re-applied here or not at all.
    const held = (callerRoles ?? []) as { role: string; deanery_id: string | null }[];
    const isSuper = held.some((r) => r.role === "super_admin");
    const isGlobal = isSuper || held.some((r) => r.role === "admin" && r.deanery_id === null);
    const adminOf = new Set(
      held.filter((r) => r.role === "admin" && r.deanery_id).map((r) => r.deanery_id as string),
    );
    const isAdmin = isGlobal || adminOf.size > 0;
    if (!isAdmin) return json({ error: "Not authorised" }, 403);
    const canAdminDeanery = (d: string | null) => isGlobal || (d !== null && adminOf.has(d));

    const body = await req.json();
    const email: string = String(body.email ?? "").trim().toLowerCase();
    const role: RoleName = body.role ?? "trainee";
    const firstName: string = String(body.first_name ?? "").trim().slice(0, 100);
    const lastName: string = String(body.last_name ?? "").trim().slice(0, 100);
    // The invite form does not ask for a deanery; an admin of exactly one
    // deanery invites into it.
    const deaneryId: string | null = body.deanery_id ||
      (!isGlobal && adminOf.size === 1 ? [...adminOf][0] : null);

    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: "Email is required" }, 400);
    if (!["super_admin", "admin", "facilitator", "trainee"].includes(role)) {
      return json({ error: "Invalid role" }, 400);
    }
    // Only super admins may mint super admins
    if (role === "super_admin" && !isSuper) {
      return json({ error: "Only super admins can invite super admins" }, 403);
    }
    // A deanery-less admin is a global admin.
    if (role === "admin" && deaneryId === null && !isSuper) {
      return json({ error: "Only super admins can create an admin for every deanery" }, 403);
    }
    // A deanery admin places people in their own deanery, and must say which.
    if (deaneryId === null ? !isGlobal : !canAdminDeanery(deaneryId)) {
      return json({ error: "You can only invite people into a deanery you administer" }, 403);
    }

    // --- Find or create the auth user ---
    let userId: string | undefined;
    const found = await findUserByEmail(admin, email);

    if (found) {
      // Inviting an existing account re-sets their roles, so it is managing
      // that person: the caller must be allowed to, exactly as the RLS on
      // user_roles and profiles would decide.
      const { data: allowed, error: scopeErr } = await admin.rpc("can_admin_user", {
        _admin: caller.id, _target: found.id,
      });
      if (scopeErr) return json({ error: "Could not check your access to that account" }, 500);
      if (allowed !== true) {
        return json({ error: "That account belongs to somebody you do not administer" }, 403);
      }
      userId = found.id;
    } else {
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email,
        password: crypto.randomUUID() + "!Aa1",
        email_confirm: true,
        user_metadata: { first_name: firstName, last_name: lastName },
      });
      if (createErr) return json({ error: createErr.message }, 400);
      userId = created?.user?.id;
    }
    if (!userId) return json({ error: "Could not create user" }, 500);

    // --- Apply the requested role (trigger already inserted 'trainee') ---
    // Clear only the rows the caller could have removed themselves: never a
    // super admin's role unless the caller is one, never a global admin row
    // unless super, and never a role scoped to a deanery the caller does not
    // administer.
    const { data: targetRoles } = await admin
      .from("user_roles").select("id, role, deanery_id").eq("user_id", userId);
    const removable = ((targetRoles ?? []) as { id: string; role: string; deanery_id: string | null }[])
      .filter((r) => r.role !== "trainee")
      .filter((r) => {
        if (isSuper) return true;
        if (r.role === "super_admin") return false;
        if (r.role === "admin") return r.deanery_id !== null && canAdminDeanery(r.deanery_id);
        return r.deanery_id === null || canAdminDeanery(r.deanery_id);
      })
      .map((r) => r.id);
    if (removable.length) {
      await admin.from("user_roles").delete().in("id", removable);
    }

    if (role === "trainee") {
      await admin.from("user_roles").upsert(
        { user_id: userId, role: "trainee", deanery_id: deaneryId },
        { onConflict: "user_id,role" },
      );
    } else {
      const { error: roleErr } = await admin.from("user_roles").upsert(
        { user_id: userId, role, deanery_id: role === "super_admin" ? null : deaneryId },
        { onConflict: "user_id,role" },
      );
      if (roleErr) return json({ error: `Role assignment failed: ${roleErr.message}` }, 500);
    }

    // --- Profile details ---
    await admin
      .from("profiles")
      .update({
        first_name: firstName || undefined,
        last_name: lastName || undefined,
        deanery_id: deaneryId,
      })
      .eq("user_id", userId);

    // --- Password set-up link ---
    const redirectTo = safeRedirect(body.redirect_to);
    const { data: linkData } = await admin.auth.admin.generateLink({
      type: "recovery",
      email,
      options: redirectTo ? { redirectTo } : undefined,
    });
    const link = linkData?.properties?.action_link ?? "#";

    const roleLabel =
      role === "super_admin" ? "Super Admin" :
      role === "admin" ? "Admin" :
      role === "facilitator" ? "Facilitator" : "Trainee";

    try {
      await sendEmail(email, "You've been invited — HST Training Hub", inviteHtml(firstName, roleLabel, link));
    } catch (e) {
      console.error("Invite email failed:", e);
      return json({ success: true, user_id: userId, email_sent: false });
    }

    return json({ success: true, user_id: userId, email_sent: true });
  } catch (error) {
    console.error("invite-user error:", error);
    return json({ error: "Something went wrong" }, 500);
  }
});
