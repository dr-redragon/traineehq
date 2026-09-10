import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

/**
 * Add somebody to a teaching register by email address.
 *
 * Runs under the service role because it may have to create an account: the
 * person being added need not have a TraineeHQ login yet, and the point of this
 * is that a deanery admin can bring in a colleague without anyone else being
 * involved. Everything it does is therefore checked here, in code:
 *
 *   - the caller must be a member of the register they are adding to;
 *   - an owner may admit an owner, an editor may only admit an editor;
 *   - the account is created without a usable password, and the person sets one
 *     through the recovery link they are emailed.
 *
 * Those rules mirror the ones row-level security enforces for every other path
 * into classic_register_members, in 20260907110000_register_access_admin.sql. They are
 * repeated rather than relied upon: the service role bypasses RLS, so a check
 * missing here is a check that does not happen.
 */

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

function joinedHtml(registerName: string, inviterName: string, link: string, needsPassword: boolean) {
  return `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px">
      <h2 style="color:#1a1a2e;margin-bottom:16px">You've been added to a teaching register</h2>
      <p style="color:#4a4a5a;line-height:1.6">
        ${inviterName || "A colleague"} has given you access to the
        <strong>${registerName}</strong> teaching register on the HST Training Hub.
      </p>
      <p style="color:#4a4a5a;line-height:1.6">
        You can record attendance, run the teaching day sign-in, and generate reports for it.
      </p>
      <div style="text-align:center;margin:28px 0">
        <a href="${link}" style="display:inline-block;background:#1a1a2e;color:#ffffff;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">
          ${needsPassword ? "Set your password" : "Open the register"}
        </a>
      </div>
      ${needsPassword
        ? `<p style="color:#8a8a9a;font-size:13px">If the link expires, use "Forgot password" on the sign-in page.</p>`
        : ""}
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

    // ---------------------------------------------------------- the caller --
    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    if (!token) return json({ error: "Not authenticated" }, 401);

    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    const caller = userData?.user;
    if (userErr || !caller) return json({ error: "Not authenticated" }, 401);

    const body = await req.json();
    const registerId: string = body.register_id ?? "";
    const email: string = (body.email ?? "").trim().toLowerCase();
    const role: string = body.role === "owner" ? "owner" : "editor";
    const firstName: string = (body.first_name ?? "").trim();
    const lastName: string = (body.last_name ?? "").trim();
    const redirectTo: string | undefined = body.redirect_to;

    if (!registerId) return json({ error: "A register is required" }, 400);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return json({ error: "That does not look like an email address" }, 400);
    }

    // --------------------------------------------------------- the register --
    const { data: register } = await admin
      .from("classic_registers")
      .select("id, name, slug")
      .eq("id", registerId)
      .maybeSingle();

    if (!register) return json({ error: "That register does not exist" }, 404);

    const { data: callerMembership } = await admin
      .from("classic_register_members")
      .select("role")
      .eq("register_id", registerId)
      .eq("user_id", caller.id)
      .maybeSingle();

    if (!callerMembership) {
      return json({ error: "Only members of that register can add people to it" }, 403);
    }
    if (role === "owner" && callerMembership.role !== "owner") {
      return json({ error: "Only an owner can add another owner" }, 403);
    }

    // ------------------------------------------------- find or make the user --
    // listUsers is paginated; ask for the one address rather than walking pages.
    const { data: matches } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    let account = matches?.users?.find((u) => u.email?.toLowerCase() === email);
    const isNew = !account;

    if (!account) {
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        // A random password nobody holds, including us: the account is reached
        // through the recovery link below, never with this value.
        password: crypto.randomUUID() + "!Aa1",
        email,
        email_confirm: true,
        user_metadata: { first_name: firstName, last_name: lastName },
      });
      if (createErr) return json({ error: createErr.message }, 400);
      account = created?.user ?? undefined;
    }

    if (!account) return json({ error: "Could not create that account" }, 500);

    // ------------------------------------------------------------ admission --
    const { error: memberErr } = await admin
      .from("classic_register_members")
      .upsert(
        { register_id: registerId, user_id: account.id, role, granted_by: caller.id },
        { onConflict: "register_id,user_id", ignoreDuplicates: true },
      );

    if (memberErr) return json({ error: `Could not add them: ${memberErr.message}` }, 500);

    // Any request they had outstanding is answered by this.
    await admin
      .from("classic_register_access_requests")
      .update({
        status: "approved",
        decided_by: caller.id,
        decided_at: new Date().toISOString(),
        decision_note: "Added directly",
      })
      .eq("register_id", registerId)
      .eq("user_id", account.id)
      .eq("status", "pending");

    // ---------------------------------------------------------------- email --
    let link = redirectTo ?? "#";
    if (isNew) {
      const { data: linkData } = await admin.auth.admin.generateLink({
        type: "recovery",
        email,
        options: redirectTo ? { redirectTo } : undefined,
      });
      link = linkData?.properties?.action_link ?? link;
    }

    const { data: inviterProfile } = await admin
      .from("profiles")
      .select("first_name, last_name")
      .eq("user_id", caller.id)
      .maybeSingle();

    const inviterName = [inviterProfile?.first_name, inviterProfile?.last_name]
      .filter(Boolean)
      .join(" ");

    try {
      await sendEmail(
        email,
        `You've been added to the ${register.name} register`,
        joinedHtml(register.name, inviterName, link, isNew),
      );
    } catch (e) {
      // The membership is real either way; say so rather than implying failure.
      console.error("Register invite email failed:", e);
      return json({ success: true, user_id: account.id, created: isNew, email_sent: false });
    }

    return json({ success: true, user_id: account.id, created: isNew, email_sent: true });
  } catch (error) {
    console.error("classic-register-invite error:", error);
    return json({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});
