// An administrator acting on somebody else's account.
//
// Three actions, each needing the service role, so none can run from the
// browser:
//
//   delete           — remove the person's sign-in account, not just their
//                      profile, then email them that it has gone. Deleting
//                      the profiles row alone left auth.users behind and the
//                      person could still log in, landing in an app with no
//                      profile and no access.
//   send_reset_link  — email them a link to choose a new password.
//   set_password     — set a new password for them directly.
//
// delete-account deliberately refuses to act on anyone but the caller; this is
// the "own function, with its own authorisation" that file asks for. The
// authorisation is can_admin_user(), the same rule the RLS on profiles and
// user_roles applies: an admin of a deanery acts on people in it (or in none),
// a global admin on anybody who is not themselves global, a super admin on
// anybody. It runs under the service role, so it is applied here or not at all.
//
// Everything personal cascades from auth.users (see delete-account); authored
// library content is ON DELETE SET NULL and stays.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const RESEND_API = "https://api.resend.com/emails";
// Same sender settings as invite-user; see the notes there.
const FROM_EMAIL = Deno.env.get("RESEND_FROM") ??
  "TraineeHQ <onboarding@resend.dev>";
const REPLY_TO = (Deno.env.get("RESEND_REPLY_TO") ?? "")
  .split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
const replyTo = REPLY_TO.length ? { reply_to: REPLY_TO } : {};

const APP_BASE_URL = (Deno.env.get("APP_BASE_URL") || "https://traineehq.com").replace(/\/+$/, "");

const MIN_PASSWORD = 8;

/** Only redirect to the app itself, never wherever the caller names. */
function safeRedirect(requested: unknown): string | undefined {
  if (typeof requested !== "string" || !requested) return undefined;
  try {
    const url = new URL(requested);
    return url.origin === new URL(APP_BASE_URL).origin ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function resetHtml(name: string, link: string) {
  return `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px">
      <h2 style="color:#1a1a2e;margin-bottom:16px">Reset your password</h2>
      <p style="color:#4a4a5a;line-height:1.6">Hi ${esc(name) || "there"},</p>
      <p style="color:#4a4a5a;line-height:1.6">
        An administrator of <strong>TraineeHQ</strong> has sent you a link to choose a new password.
      </p>
      <div style="text-align:center;margin:28px 0">
        <a href="${esc(link)}" style="display:inline-block;background:#1a1a2e;color:#ffffff;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">
          Choose a new password
        </a>
      </div>
      <p style="color:#8a8a9a;font-size:13px">If the link expires, use "Forgot password" on the login page.</p>
      <p style="color:#8a8a9a;font-size:13px;margin-top:32px">— TraineeHQ</p>
    </div>`;
}

function deletedHtml(name: string, note: string) {
  return `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px">
      <h2 style="color:#1a1a2e;margin-bottom:16px">Your account has been closed</h2>
      <p style="color:#4a4a5a;line-height:1.6">Hi ${esc(name) || "there"},</p>
      <p style="color:#4a4a5a;line-height:1.6">
        An administrator has deleted your <strong>TraineeHQ</strong> account. You can no longer sign in,
        and your profile, roles, specialty access and register memberships have been removed.
      </p>
      ${note ? `<p style="color:#4a4a5a;line-height:1.6;border-left:3px solid #dd2b0f;padding-left:12px">${esc(note)}</p>` : ""}
      <p style="color:#4a4a5a;line-height:1.6">
        If you think this is a mistake, or you need access again, contact your deanery's programme
        administrator. They can invite you back.
      </p>
      <p style="color:#8a8a9a;font-size:13px;margin-top:32px">— TraineeHQ</p>
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
}

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

    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? "");
    const targetId = String(body.user_id ?? "");
    if (!["delete", "send_reset_link", "set_password"].includes(action)) {
      return json({ error: "Unknown action" }, 400);
    }
    if (!/^[0-9a-f-]{36}$/i.test(targetId)) return json({ error: "user_id is required" }, 400);

    if (targetId === caller.id) {
      return json({
        error: action === "delete"
          ? "Delete your own account from your profile page."
          : "Change your own password from your profile page.",
      }, 400);
    }

    // can_admin_user is false for anybody who is not an admin at all, so this
    // one check is also the "are you an admin" check.
    const { data: allowed, error: scopeErr } = await admin.rpc("can_admin_user", {
      _admin: caller.id, _target: targetId,
    });
    if (scopeErr) return json({ error: "Could not check your access to that account" }, 500);
    if (allowed !== true) {
      return json({ error: "That account belongs to somebody you do not administer" }, 403);
    }

    const { data: target, error: targetErr } = await admin.auth.admin.getUserById(targetId);
    const targetUser = target?.user;

    // --- delete ---
    if (action === "delete") {
      // A profile whose sign-in account is already gone: tidy the profile up.
      if (targetErr || !targetUser) {
        const { error } = await admin.from("profiles").delete().eq("user_id", targetId);
        if (error) return json({ error: "Could not remove the profile" }, 500);
        return json({ success: true });
      }

      // Never leave the platform with nobody who can administer it.
      const { data: targetRoles } = await admin
        .from("user_roles").select("role").eq("user_id", targetId);
      if ((targetRoles ?? []).some((r: { role: string }) => r.role === "super_admin")) {
        const { count } = await admin
          .from("user_roles")
          .select("user_id", { count: "exact", head: true })
          .eq("role", "super_admin");
        if ((count ?? 0) <= 1) {
          return json({ error: "That is the only super admin. Give somebody else the role first." }, 409);
        }
      }

      // Read who they are before the cascade takes the profile with it.
      const { data: profile } = await admin
        .from("profiles").select("first_name").eq("user_id", targetId).maybeSingle();

      const { error: deleteErr } = await admin.auth.admin.deleteUser(targetId);
      if (deleteErr) {
        console.error("admin-user delete failed:", deleteErr);
        return json({ error: "Could not delete the account. Please try again." }, 500);
      }

      // Tell them, once the account is really gone. A failed email does not
      // undo the deletion; the admin is told it did not go.
      if (!targetUser.email) return json({ success: true, email_sent: false });
      const note = String(body.note ?? "").trim().slice(0, 1000);
      try {
        await sendEmail(
          targetUser.email,
          "Your TraineeHQ account has been closed",
          deletedHtml(profile?.first_name ?? "", note),
        );
      } catch (e) {
        console.error("Deletion email failed:", e);
        return json({ success: true, email_sent: false });
      }
      return json({ success: true, email_sent: true });
    }

    if (targetErr || !targetUser?.email) {
      return json({ error: "That person has no sign-in account" }, 404);
    }

    // --- set_password ---
    if (action === "set_password") {
      const password = String(body.password ?? "");
      if (password.length < MIN_PASSWORD) {
        return json({ error: `The password must be at least ${MIN_PASSWORD} characters` }, 400);
      }
      const { error } = await admin.auth.admin.updateUserById(targetId, { password });
      if (error) return json({ error: error.message }, 400);
      return json({ success: true });
    }

    // --- send_reset_link ---
    const redirectTo = safeRedirect(body.redirect_to);
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: "recovery",
      email: targetUser.email,
      options: redirectTo ? { redirectTo } : undefined,
    });
    const link = linkData?.properties?.action_link;
    if (linkErr || !link) return json({ error: "Could not create a reset link" }, 500);

    const { data: profile } = await admin
      .from("profiles").select("first_name").eq("user_id", targetId).maybeSingle();

    try {
      await sendEmail(
        targetUser.email,
        "Reset your password — TraineeHQ",
        resetHtml(profile?.first_name ?? "", link),
      );
    } catch (e) {
      // The admin can pass the link on themselves — they could set the
      // password outright anyway, so this hands them nothing new.
      console.error("Reset email failed:", e);
      return json({ success: true, email_sent: false, link });
    }
    return json({ success: true, email_sent: true });
  } catch (error) {
    console.error("admin-user error:", error);
    return json({ error: "Something went wrong" }, 500);
  }
});
