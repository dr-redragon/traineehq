import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

/**
 * Add somebody to a teaching register by email address.
 *
 * Runs under the service role because it may have to create an account: the
 * person being added need not have a TraineeHQ login yet, and the point of this
 * is that a deanery admin can bring in a colleague without anyone else being
 * involved. Everything it does is therefore checked here, in code:
 *
 *   - the caller must be an OWNER of the register they are adding to — the
 *     register holds absence and leave records, and who may read them is the
 *     owners' decision (20261012090000);
 *   - an account is created directly only when the caller administers the
 *     register's deanery. Any other owner gets an ACCOUNT REQUEST filed on the
 *     colleague's behalf, naming this register, for the deanery's admins to
 *     decide (20261012150000); approving it creates the account, adds them to
 *     the register and makes them a facilitator of its specialty;
 *   - an account created here is given the same: register membership and
 *     facilitator of the register's specialty;
 *   - a created account has no usable password, and the person sets one
 *     through the recovery link they are emailed.
 *
 * Those rules mirror the ones row-level security enforces for every other path
 * into register_members, in 20260907110000_register_access_admin.sql. They are
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
// RESEND_FROM to an address on the verified domain ("TraineeHQ
// <noreply@example.nhs.uk>") and every function picks it up with no code change.
// Declared per function rather than shared, so each one deploys on its own.
const FROM_EMAIL = Deno.env.get("RESEND_FROM") ??
  "TraineeHQ <onboarding@resend.dev>";

// Where replies land. The sender above is a no-reply address with no mailbox
// behind it, so without this a trainee replying to their certificate gets a
// bounce. A reply-to is not a sender: it can be any ordinary mailbox — NHS,
// Gmail, anything — no matter which domain is verified in Resend. Comma- or
// space-separated; unset means no Reply-To header at all.
const REPLY_TO = (Deno.env.get("RESEND_REPLY_TO") ?? "")
  .split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
const replyTo = REPLY_TO.length ? { reply_to: REPLY_TO } : {};

// Where links in this email may point. The caller never chooses the origin, so
// the hub's sender cannot be made to mail a button that lands somewhere else.
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

/** Escape anything interpolated into the email — names and titles are user-written. */
function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/**
 * The auth account for an address, if there is one. listUsers() is paginated;
 * reading one page misses every account beyond it.
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

/**
 * Make somebody a facilitator of the register's specialty: the role, in the
 * register's deanery, and the specialty itself. Never narrows anything they
 * already hold — an existing facilitator row is left as it is.
 */
// deno-lint-ignore no-explicit-any
async function grantFacilitator(admin: any, userId: string, deaneryId: string | null, specialtyId: string | null) {
  if (!specialtyId) return false;
  const { data: specialty } = await admin
    .from("specialties").select("id, deanery_id").eq("id", specialtyId).maybeSingle();
  if (!specialty) return false;
  const { error: roleErr } = await admin.from("user_roles").upsert(
    { user_id: userId, role: "facilitator", deanery_id: deaneryId ?? specialty.deanery_id },
    { onConflict: "user_id,role", ignoreDuplicates: true },
  );
  if (roleErr) { console.error("facilitator role failed:", roleErr); return false; }
  const { error: facErr } = await admin.from("facilitator_specialties").upsert(
    { user_id: userId, specialty_id: specialty.id },
    { onConflict: "user_id,specialty_id", ignoreDuplicates: true },
  );
  if (facErr) { console.error("facilitator specialty failed:", facErr); return false; }
  return true;
}

function joinedHtml(registerName: string, inviterName: string, link: string, needsPassword: boolean) {
  return `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px">
      <h2 style="color:#1a1a2e;margin-bottom:16px">You've been added to a teaching register</h2>
      <p style="color:#4a4a5a;line-height:1.6">
        ${esc(inviterName) || "A colleague"} has given you access to the
        <strong>${esc(registerName)}</strong> teaching register on TraineeHQ.
      </p>
      <p style="color:#4a4a5a;line-height:1.6">
        You can record attendance, run the teaching day sign-in, and generate reports for it.
      </p>
      <div style="text-align:center;margin:28px 0">
        <a href="${esc(link)}" style="display:inline-block;background:#1a1a2e;color:#ffffff;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">
          ${needsPassword ? "Set your password" : "Open the register"}
        </a>
      </div>
      ${needsPassword
        ? `<p style="color:#8a8a9a;font-size:13px">If the link expires, use "Forgot password" on the sign-in page.</p>`
        : ""}
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
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    if (!token) return json({ error: "Not authenticated" }, 401);

    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    const caller = userData?.user;
    if (userErr || !caller) return json({ error: "Not authenticated" }, 401);

    const body = await req.json();
    const registerId: string = String(body.register_id ?? "");
    const email: string = String(body.email ?? "").trim().toLowerCase();
    const role: string = body.role === "owner" ? "owner" : "editor";
    const firstName: string = String(body.first_name ?? "").trim().slice(0, 100);
    const lastName: string = String(body.last_name ?? "").trim().slice(0, 100);
    const redirectTo = safeRedirect(body.redirect_to);
    // Set on the second step, once the owner has been told there is no account
    // and has filled in the colleague's name and the reason.
    const requestAccount = body.request_account === true;
    const reason: string = String(body.reason ?? "").trim().slice(0, 2000);

    if (!registerId) return json({ error: "A register is required" }, 400);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return json({ error: "That does not look like an email address" }, 400);
    }

    // --------------------------------------------------------- the register --
    const { data: register } = await admin
      .from("registers")
      .select("id, name, slug, deanery_id, specialty_id")
      .eq("id", registerId)
      .maybeSingle();

    if (!register) return json({ error: "That register does not exist" }, 404);

    const { data: callerMembership } = await admin
      .from("register_members")
      .select("role")
      .eq("register_id", registerId)
      .eq("user_id", caller.id)
      .maybeSingle();

    if (callerMembership?.role !== "owner") {
      return json({ error: "Only an owner of that register can add people to it" }, 403);
    }

    // ------------------------------------------------- find or make the user --
    let account: { id: string } | undefined = (await findUserByEmail(admin, email)) ?? undefined;
    const isNew = !account;

    if (!account) {
      const { data: adminsDeanery } = await admin.rpc("is_admin_of_deanery", {
        _user_id: caller.id, _deanery_id: register.deanery_id,
      });
      if (adminsDeanery !== true) {
        return await requestAnAccount();
      }

      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        // A random password nobody holds, including us: the account is reached
        // through the recovery link below, never with this value.
        password: crypto.randomUUID() + "!Aa1",
        email,
        email_confirm: true,
        user_metadata: { first_name: firstName, last_name: lastName },
      });
      if (createErr) {
        console.error("register-invite createUser failed:", createErr);
        return json({ error: "Could not create that account" }, 400);
      }
      account = created?.user ? { id: created.user.id } : undefined;
    }

    if (!account) return json({ error: "Could not create that account" }, 500);

    // Somebody whose account is made for a register runs it as a facilitator
    // of the register's specialty. An existing account keeps whatever it has.
    if (isNew) await grantFacilitator(admin, account.id, register.deanery_id, register.specialty_id);

    // ------------------------------------------------------------ admission --
    const { error: memberErr } = await admin
      .from("register_members")
      .upsert(
        { register_id: registerId, user_id: account.id, role, granted_by: caller.id },
        { onConflict: "register_id,user_id", ignoreDuplicates: true },
      );

    if (memberErr) {
      console.error("register-invite admission failed:", memberErr);
      return json({ error: "Could not add them to the register" }, 500);
    }

    // Any request they had outstanding is answered by this.
    await admin
      .from("register_access_requests")
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
    let link = redirectTo ?? `${APP_BASE_URL}/registers`;
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

    /**
     * No account, and the caller cannot create one: ask the deanery's admins.
     * The first call only says so, with a suggested reason; the owner then
     * confirms the colleague's name and the reason, and the second call files
     * the request.
     */
    async function requestAnAccount() {
      const [{ data: specialty }, { data: deanery }, { data: me }] = await Promise.all([
        admin.from("specialties").select("name").eq("id", register!.specialty_id).maybeSingle(),
        admin.from("deaneries").select("name").eq("id", register!.deanery_id).maybeSingle(),
        admin.from("profiles").select("first_name, last_name").eq("user_id", caller!.id).maybeSingle(),
      ]);
      const ownerName = [me?.first_name, me?.last_name].filter(Boolean).join(" ") || "A register owner";
      const where = [specialty?.name, deanery?.name].filter(Boolean).join(", ");

      if (!requestAccount) {
        return json({
          needs_account: true,
          specialty_name: specialty?.name ?? null,
          suggested_reason:
            `${ownerName} has asked for access to the "${register!.name}" teaching register` +
            (where ? ` (${where})` : "") +
            `, to help run it as ${role === "owner" ? "an owner" : "an editor"}` +
            (specialty?.name ? `, as a facilitator of ${specialty.name}.` : "."),
        });
      }

      if (!firstName || !lastName) {
        return json({ error: "Their first and last name are needed for the account request" }, 400);
      }

      const { data: pending } = await admin
        .from("access_requests").select("id").eq("email", email).eq("status", "pending").limit(1);
      if (pending?.length) {
        return json({
          error: "There is already an account request waiting for that address. " +
            "Once an admin approves it, you can add them here.",
        }, 409);
      }

      const { data: filed, error: fileErr } = await admin
        .from("access_requests")
        .insert({
          first_name: firstName,
          last_name: lastName,
          email,
          reason: reason || null,
          deanery_id: register!.deanery_id,
          specialty_id: register!.specialty_id,
          register_id: register!.id,
          register_role: role,
          requested_by: caller!.id,
        })
        .select("id");
      if (fileErr) {
        console.error("register-invite request failed:", fileErr);
        return json({ error: "Could not send the account request" }, 500);
      }
      // The insert trigger drops a request for an address that has, in the
      // meantime, got an account. Adding them is then the ordinary path.
      if (!filed?.length) {
        return json({ error: "That address now has an account — try adding them again." }, 409);
      }

      // The applicant's confirmation and the admins' alert, sent the way every
      // other request's are.
      const { error: notifyErr } = await admin.functions.invoke("access-request-email", {
        body: { type: "submission_confirmation", applicant_email: email },
      });
      if (notifyErr) console.error("register-invite notification failed:", notifyErr);

      return json({ success: true, requested: true, email_sent: !notifyErr });
    }
  } catch (error) {
    console.error("register-invite error:", error);
    return json({ error: "Something went wrong" }, 500);
  }
});
