import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const RESEND_API = "https://api.resend.com/emails";
const FROM_EMAIL = "HST Training Hub <onboarding@resend.dev>";

type RoleName = "super_admin" | "admin" | "facilitator" | "trainee";

function inviteHtml(name: string, roleLabel: string, link: string) {
  return `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px">
      <h2 style="color:#1a1a2e;margin-bottom:16px">You've been invited</h2>
      <p style="color:#4a4a5a;line-height:1.6">Hi ${name || "there"},</p>
      <p style="color:#4a4a5a;line-height:1.6">
        You've been invited to the <strong>HST Training Hub</strong> as <strong>${roleLabel}</strong>.
      </p>
      <div style="text-align:center;margin:28px 0">
        <a href="${link}" style="display:inline-block;background:#1a1a2e;color:#ffffff;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">
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
    body: JSON.stringify({ from: FROM_EMAIL, to: [to], subject, html }),
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

    const isSuper = callerRoles?.some((r) => r.role === "super_admin") ?? false;
    const isAdmin = isSuper || (callerRoles?.some((r) => r.role === "admin") ?? false);
    if (!isAdmin) return json({ error: "Not authorised" }, 403);

    const body = await req.json();
    const email: string = (body.email ?? "").trim().toLowerCase();
    const role: RoleName = body.role ?? "trainee";
    const firstName: string = body.first_name ?? "";
    const lastName: string = body.last_name ?? "";
    const deaneryId: string | null = body.deanery_id ?? null;

    if (!email) return json({ error: "Email is required" }, 400);
    if (!["super_admin", "admin", "facilitator", "trainee"].includes(role)) {
      return json({ error: "Invalid role" }, 400);
    }
    // Only super admins may mint super admins
    if (role === "super_admin" && !isSuper) {
      return json({ error: "Only super admins can invite super admins" }, 403);
    }

    // --- Find or create the auth user ---
    let userId: string | undefined;
    const { data: existing } = await admin.auth.admin.listUsers();
    const found = existing?.users?.find((u) => u.email?.toLowerCase() === email);

    if (found) {
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
    await admin.from("user_roles").delete().eq("user_id", userId).neq("role", "trainee");

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
    const redirectTo = body.redirect_to as string | undefined;
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
    const message = error instanceof Error ? error.message : "Unknown error";
    return json({ error: message }, 500);
  }
});
