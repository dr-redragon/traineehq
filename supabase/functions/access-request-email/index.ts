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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MAX_NAME = 200;
const MAX_NOTE = 2000;

interface EmailPayload {
  type:
    | "submission_confirmation" | "approved" | "rejected"
    | "specialty_request_submitted" | "specialty_request_decided";
  /** submission_confirmation only: the address the public form was filled in with. */
  applicant_email?: string;
  /**
   * Every other type: the row the email is about — an access_requests row for
   * approved / rejected, a specialty_access_requests row for specialty_request_*.
   * Who to email, and what to say, are read from that row, never from the caller.
   */
  request_id?: string;
}

interface AccessRequestRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  status: "pending" | "approved" | "rejected";
  specialty_id: string | null;
  deanery_id: string | null;
  review_note: string | null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function getSupabaseAdmin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

/** Escape anything interpolated into an email body — all of it is caller-supplied. */
function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * The auth account for an address, if there is one. listUsers() is paginated
 * (50 a page by default), so reading only its first page misses every account
 * beyond it, and the createUser that follows fails as a duplicate.
 */
async function findUserByEmail(
  admin: ReturnType<typeof getSupabaseAdmin>,
  email: string,
): Promise<{ id: string } | null> {
  const perPage = 1000;
  for (let page = 1; page <= 100; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(`Could not look up accounts: ${error.message}`);
    const users = data?.users ?? [];
    const found = users.find((u) => u.email?.toLowerCase() === email);
    if (found) return { id: found.id };
    if (users.length < perPage) return null;
  }
  throw new Error("Too many accounts to search");
}

/** The signed-in caller, from their own JWT. Null when there is none. */
async function getCaller(
  admin: ReturnType<typeof getSupabaseAdmin>,
  req: Request,
): Promise<{ id: string } | null> {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;

  const { data: userData, error } = await admin.auth.getUser(token);
  const caller = userData?.user;
  return error || !caller ? null : { id: caller.id };
}

/**
 * May this caller decide THIS request?
 *
 * Approving provisions an account and enrols it on a specialty, so holding a
 * reviewing role somewhere is not enough — the caller must be able to review
 * the specialty and deanery the request is for:
 *
 *   super_admin                  any request
 *   admin, no deanery            any request
 *   admin of a deanery           requests for that deanery (or for a specialty in it)
 *   facilitator                  requests for a specialty they facilitate (or its child)
 *
 * The service role bypasses row-level security, so this check happens here in
 * code or not at all.
 */
async function canReviewRequest(
  admin: ReturnType<typeof getSupabaseAdmin>,
  callerId: string,
  request: AccessRequestRow,
): Promise<boolean> {
  const { data: roles } = await admin
    .from("user_roles")
    .select("role, deanery_id")
    .eq("user_id", callerId);
  const held = (roles ?? []) as { role: string; deanery_id: string | null }[];

  if (held.some((r) => r.role === "super_admin")) return true;
  if (held.some((r) => r.role === "admin" && r.deanery_id === null)) return true;

  let specialty: { id: string; deanery_id: string; parent_specialty_id: string | null } | null = null;
  if (request.specialty_id) {
    const { data } = await admin
      .from("specialties")
      .select("id, deanery_id, parent_specialty_id")
      .eq("id", request.specialty_id)
      .maybeSingle();
    specialty = data;
  }

  const requestDeaneries = new Set(
    [request.deanery_id, specialty?.deanery_id].filter((d): d is string => !!d),
  );
  if (held.some((r) => r.role === "admin" && r.deanery_id && requestDeaneries.has(r.deanery_id))) {
    return true;
  }

  if (specialty && held.some((r) => r.role === "facilitator")) {
    const { data: facilitates } = await admin
      .from("facilitator_specialties")
      .select("specialty_id")
      .eq("user_id", callerId)
      .in("specialty_id", [specialty.id, specialty.parent_specialty_id].filter(Boolean));
    if ((facilitates ?? []).length > 0) return true;
  }

  return false;
}

async function sendEmail(to: string, subject: string, html: string) {
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY is not configured");

  const res = await fetch(RESEND_API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: FROM_EMAIL, to: [to], subject, html, ...replyTo }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend API error [${res.status}]: ${body}`);
  }
  return res.json();
}

/** The caller's user id from their JWT, or null. */
async function getCallerId(
  admin: ReturnType<typeof getSupabaseAdmin>,
  req: Request,
): Promise<string | null> {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  return error || !data?.user ? null : data.user.id;
}

function specialtyRequestAlertHtml(
  name: string, email: string, specialty: string, reason: string | null, siteUrl: string,
) {
  return `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px">
      <h2 style="color:#1a1a2e;margin-bottom:16px">Specialty Access Request</h2>
      <p style="color:#4a4a5a;line-height:1.6">
        <strong>${esc(name)}</strong> (${esc(email)}) has asked to join <strong>${esc(specialty)}</strong>.
      </p>
      ${reason ? `<p style="color:#4a4a5a;line-height:1.6;background:#f8f8fc;padding:12px 16px;border-radius:8px;border-left:3px solid #ccc"><em>${esc(reason)}</em></p>` : ""}
      <p style="color:#4a4a5a;line-height:1.6">
        Review it in the Admin Panel or Facilitator Panel${siteUrl ? `: <a href="${esc(siteUrl)}">${esc(siteUrl)}</a>` : "."}
      </p>
      <p style="color:#8a8a9a;font-size:13px;margin-top:32px">— HST Training Hub</p>
    </div>`;
}

function specialtyRequestReceivedHtml(name: string, specialty: string) {
  return `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px">
      <h2 style="color:#1a1a2e;margin-bottom:16px">Request Received</h2>
      <p style="color:#4a4a5a;line-height:1.6">Hi ${esc(name)},</p>
      <p style="color:#4a4a5a;line-height:1.6">
        Your request to join <strong>${esc(specialty)}</strong> has been sent for review.
        You'll get another email once it has been decided.
      </p>
      <p style="color:#8a8a9a;font-size:13px;margin-top:32px">— HST Training Hub</p>
    </div>`;
}

function specialtyRequestDecidedHtml(
  name: string, specialty: string, approved: boolean, note: string | null,
) {
  return `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px">
      <h2 style="color:#1a1a2e;margin-bottom:16px">${approved ? "Specialty Access Approved ✅" : "Specialty Access Request Update"}</h2>
      <p style="color:#4a4a5a;line-height:1.6">Hi ${esc(name)},</p>
      <p style="color:#4a4a5a;line-height:1.6">
        ${approved
          ? `Your request to join <strong>${esc(specialty)}</strong> has been approved. It is in your sidebar the next time you sign in or refresh the page.`
          : `Your request to join <strong>${esc(specialty)}</strong> was not approved at this time.`}
      </p>
      ${note ? `<p style="color:#4a4a5a;line-height:1.6;background:#f8f8fc;padding:12px 16px;border-radius:8px;border-left:3px solid #ccc"><strong>Note:</strong> <em>${esc(note)}</em></p>` : ""}
      <p style="color:#8a8a9a;font-size:13px;margin-top:32px">— HST Training Hub</p>
    </div>`;
}

/**
 * Emails about a request to join another specialty, made from the profile page.
 *
 * Nothing is taken from the request body but the row id: who to write to, and
 * what to say, are read from the database. "submitted" may only be sent by the
 * person who made the request, while it is still pending; "decided" only by
 * somebody who may review that specialty, once it has been decided.
 */
async function handleSpecialtyRequest(
  admin: ReturnType<typeof getSupabaseAdmin>,
  req: Request,
  payload: EmailPayload,
) {
  const callerId = await getCallerId(admin, req);
  if (!callerId) return json({ error: "Not authorised" }, 403);

  const requestId = String(payload.request_id ?? "");
  const { data: request } = await admin
    .from("specialty_access_requests")
    .select("id, user_id, specialty_id, reason, status, review_note")
    .eq("id", requestId)
    .maybeSingle();
  if (!request) return json({ error: "Request not found" }, 404);

  const [{ data: person }, { data: spec }] = await Promise.all([
    admin.from("profiles").select("first_name, last_name, email").eq("user_id", request.user_id).maybeSingle(),
    admin.from("specialties").select("id, short_name, deanery_id, parent_specialty_id").eq("id", request.specialty_id).maybeSingle(),
  ]);
  const name = `${person?.first_name ?? ""} ${person?.last_name ?? ""}`.trim() || "there";
  const specialtyName = spec?.short_name ?? "a specialty";

  if (payload.type === "specialty_request_submitted") {
    if (callerId !== request.user_id || request.status !== "pending") {
      return json({ error: "Not authorised" }, 403);
    }

    // The same people can_review_specialty() lets decide it: super admins, the
    // admins of its deanery, and its facilitators (or its parent's).
    const { data: roles } = await admin
      .from("user_roles")
      .select("user_id, role, deanery_id")
      .in("role", ["admin", "super_admin"]);
    const adminIds = (roles ?? [])
      .filter((r: { role: string; deanery_id: string | null }) =>
        r.role === "super_admin" || r.deanery_id === null || r.deanery_id === spec?.deanery_id)
      .map((r: { user_id: string }) => r.user_id);
    const specIds = [spec?.id, spec?.parent_specialty_id].filter(Boolean) as string[];
    const { data: facs } = specIds.length
      ? await admin.from("facilitator_specialties").select("user_id").in("specialty_id", specIds)
      : { data: [] };
    const notifyIds = [...new Set([...adminIds, ...(facs ?? []).map((f: { user_id: string }) => f.user_id)])]
      .filter((id) => id !== request.user_id);

    if (notifyIds.length) {
      const { data: profiles } = await admin.from("profiles").select("email").in("user_id", notifyIds);
      // Fixed rather than read from the request's Origin, which the caller controls.
      const siteUrl = Deno.env.get("SITE_URL") ?? "https://traineehq.com";
      const html = specialtyRequestAlertHtml(name, person?.email ?? "", specialtyName, request.reason, siteUrl);
      for (const p of profiles ?? []) {
        if (!p.email) continue;
        try { await sendEmail(p.email, `Specialty access request: ${name} → ${specialtyName}`, html); }
        catch (e) { console.error(`Failed to notify ${p.email}:`, e); }
      }
    } else {
      console.warn(`No reviewer to notify about specialty request ${request.id}.`);
    }

    if (person?.email) {
      await sendEmail(
        person.email,
        `Request received: ${specialtyName} — HST Training Hub`,
        specialtyRequestReceivedHtml(name, specialtyName),
      );
    }
    return json({ success: true });
  }

  // specialty_request_decided
  const { data: mayReview } = await admin.rpc("can_review_specialty", {
    _user_id: callerId, _specialty_id: request.specialty_id,
  });
  if (!mayReview || request.status === "pending") {
    return json({ error: "Not authorised" }, 403);
  }
  if (!person?.email) return json({ success: true, skipped: "no email address" });
  const approved = request.status === "approved";
  await sendEmail(
    person.email,
    approved
      ? `Access approved: ${specialtyName} — HST Training Hub`
      : `Specialty access request update — HST Training Hub`,
    specialtyRequestDecidedHtml(name, specialtyName, approved, request.review_note),
  );
  return json({ success: true });
}

// Where links in emails point. Fixed, never taken from the request.
const SITE_URL = (Deno.env.get("SITE_URL") || Deno.env.get("APP_BASE_URL") || "https://traineehq.com")
  .replace(/\/+$/, "");

/** True unless `recipient` was sent a `kind` email within the last `hours`. */
async function mayEmail(
  admin: ReturnType<typeof getSupabaseAdmin>, kind: string, recipient: string, hours: number,
): Promise<boolean> {
  const since = new Date(Date.now() - hours * 3600_000).toISOString();
  const { count, error } = await admin
    .from("outbound_email_log")
    .select("id", { count: "exact", head: true })
    .eq("kind", kind)
    .eq("recipient", recipient.toLowerCase())
    .gte("sent_at", since);
  if (error) { console.error("outbound_email_log read failed:", error); return false; }
  return (count ?? 0) === 0;
}

async function logEmail(admin: ReturnType<typeof getSupabaseAdmin>, kind: string, recipient: string) {
  const { error } = await admin.from("outbound_email_log").insert({ kind, recipient: recipient.toLowerCase() });
  if (error) console.error("outbound_email_log write failed:", error);
}

function existingAccountHtml(resetLink: string) {
  return `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px">
      <h2 style="color:#1a1a2e;margin-bottom:16px">You already have an account</h2>
      <p style="color:#4a4a5a;line-height:1.6">
        Somebody asked for access to the <strong>HST Training Hub</strong> with this email address,
        but it already has an account. If that was you, set a new password and sign in:
      </p>
      <div style="text-align:center;margin:28px 0">
        <a href="${esc(resetLink)}" style="display:inline-block;background:#1a1a2e;color:#ffffff;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">
          Set a new password
        </a>
      </div>
      <p style="color:#8a8a9a;font-size:13px">If it was not you, you can ignore this email; nothing has changed.</p>
      <p style="color:#8a8a9a;font-size:13px;margin-top:32px">— HST Training Hub</p>
    </div>`;
}

function submissionConfirmationHtml(name: string) {
  return `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px">
      <h2 style="color:#1a1a2e;margin-bottom:16px">Request Received</h2>
      <p style="color:#4a4a5a;line-height:1.6">Hi ${esc(name)},</p>
      <p style="color:#4a4a5a;line-height:1.6">
        Thank you for requesting access to the <strong>HST Training Hub</strong>.
        Your application has been received and will be reviewed by an administrator.
      </p>
      <p style="color:#4a4a5a;line-height:1.6">
        You'll receive another email once your request has been reviewed.
      </p>
      <p style="color:#8a8a9a;font-size:13px;margin-top:32px">— HST Training Hub</p>
    </div>`;
}

function newRequestAlertHtml(name: string, email: string, specialty: string, grade?: string) {
  return `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px">
      <h2 style="color:#1a1a2e;margin-bottom:16px">New Access Request</h2>
      <p style="color:#4a4a5a;line-height:1.6">A new access request has been submitted:</p>
      <table style="border-collapse:collapse;width:100%;margin:16px 0">
        <tr><td style="padding:8px 12px;color:#8a8a9a;font-size:13px">Name</td><td style="padding:8px 12px;color:#1a1a2e;font-weight:600">${esc(name)}</td></tr>
        <tr style="background:#f8f8fc"><td style="padding:8px 12px;color:#8a8a9a;font-size:13px">Email</td><td style="padding:8px 12px;color:#1a1a2e">${esc(email)}</td></tr>
        <tr><td style="padding:8px 12px;color:#8a8a9a;font-size:13px">Specialty</td><td style="padding:8px 12px;color:#1a1a2e">${esc(specialty)}</td></tr>
        ${grade ? `<tr style="background:#f8f8fc"><td style="padding:8px 12px;color:#8a8a9a;font-size:13px">Grade</td><td style="padding:8px 12px;color:#1a1a2e">${esc(grade)}</td></tr>` : ""}
      </table>
      <p style="color:#4a4a5a;line-height:1.6">Please log in to the Admin Panel to review this request.</p>
      <p style="color:#8a8a9a;font-size:13px;margin-top:32px">— HST Training Hub</p>
    </div>`;
}

function approvedHtml(name: string, resetLink: string) {
  return `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px">
      <h2 style="color:#1a1a2e;margin-bottom:16px">Access Approved ✅</h2>
      <p style="color:#4a4a5a;line-height:1.6">Hi ${esc(name)},</p>
      <p style="color:#4a4a5a;line-height:1.6">
        Great news! Your access request for the <strong>HST Training Hub</strong> has been approved.
      </p>
      <p style="color:#4a4a5a;line-height:1.6">
        Click the button below to set your password and activate your account:
      </p>
      <div style="text-align:center;margin:28px 0">
        <a href="${esc(resetLink)}" style="display:inline-block;background:#1a1a2e;color:#ffffff;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">
          Set Your Password
        </a>
      </div>
      <p style="color:#8a8a9a;font-size:13px">
        This link will expire in 24 hours. If it expires, you can request a new one from the login page using "Forgot password".
      </p>
      <p style="color:#8a8a9a;font-size:13px;margin-top:32px">— HST Training Hub</p>
    </div>`;
}

function rejectedHtml(name: string, reason: string) {
  return `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px">
      <h2 style="color:#1a1a2e;margin-bottom:16px">Access Request Update</h2>
      <p style="color:#4a4a5a;line-height:1.6">Hi ${esc(name)},</p>
      <p style="color:#4a4a5a;line-height:1.6">
        Unfortunately, your access request for the HST Training Hub was not approved at this time.
      </p>
      <p style="color:#4a4a5a;line-height:1.6;background:#f8f8fc;padding:12px 16px;border-radius:8px;border-left:3px solid #ccc">
        <strong>Reason:</strong> <em>${esc(reason)}</em>
      </p>
      <p style="color:#4a4a5a;line-height:1.6">
        If you believe this was in error, please contact your training programme director.
      </p>
      <p style="color:#8a8a9a;font-size:13px;margin-top:32px">— HST Training Hub</p>
    </div>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const payload: EmailPayload = await req.json();
    const { type } = payload;

    // Requests to join another specialty identify everything by the row id.
    if (type === "specialty_request_submitted" || type === "specialty_request_decided") {
      return await handleSpecialtyRequest(getSupabaseAdmin(), req, payload);
    }

    const supabaseAdmin = getSupabaseAdmin();

    if (type === "submission_confirmation") {
      const applicantEmail = String(payload.applicant_email ?? "").trim().toLowerCase();
      if (!EMAIL_RE.test(applicantEmail)) {
        return json({ error: "A valid applicant email is required" }, 400);
      }

      // This branch is reachable without a session, by design — the Request Access
      // form is public. So it answers every caller the same way, whatever the
      // address: a stranger must not learn from it whether somebody is registered
      // or has applied. What differs is what the INBOX receives, and only once.
      const { data: request } = await supabaseAdmin
        .from("access_requests")
        .select("id, first_name, last_name, email, training_grade, specialty_id, deanery_id, status, confirmation_sent_at")
        .eq("email", applicantEmail)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!request) {
        // Not stored — usually because the address already has an account (the
        // insert trigger drops those rows). Send that inbox a reset link instead,
        // at most once a day, so the form cannot be used to mail-bomb it.
        const { data: hasAccount } = await supabaseAdmin.rpc("email_has_account", { _email: applicantEmail });
        if (hasAccount === true && await mayEmail(supabaseAdmin, "existing_account_nudge", applicantEmail, 24)) {
          const { data: linkData } = await supabaseAdmin.auth.admin.generateLink({
            type: "recovery",
            email: applicantEmail,
            options: { redirectTo: `${SITE_URL}/reset-password` },
          });
          const link = linkData?.properties?.action_link;
          if (link) {
            try {
              await sendEmail(applicantEmail, "You already have an account — HST Training Hub", existingAccountHtml(link));
              await logEmail(supabaseAdmin, "existing_account_nudge", applicantEmail);
            } catch (e) { console.error("existing-account email failed:", e); }
          }
        }
        return json({ success: true });
      }

      // Already confirmed: calling again sends nothing, so one request cannot be
      // replayed into a stream of emails to the applicant and every reviewer.
      if (request.confirmation_sent_at) {
        return json({ success: true });
      }
      const { data: claimed } = await supabaseAdmin
        .from("access_requests")
        .update({ confirmation_sent_at: new Date().toISOString() })
        .eq("id", request.id)
        .is("confirmation_sent_at", null)
        .select("id");
      if (!claimed?.length) return json({ success: true });

      const name = `${request.first_name ?? ""} ${request.last_name ?? ""}`.trim();

      await sendEmail(
        request.email,
        "Access Request Received — HST Training Hub",
        submissionConfirmationHtml(name),
      );

      // Notify the people who can review it: super admins, global admins, the
      // admins of the request's deanery, and the specialty's facilitators — the
      // same people canReviewRequest() lets decide it. Not every admin on the
      // platform: an admin of another deanery has no business with this one.
      let facilitatorIds: string[] = [];
      let specialtyName = "General";
      let specialtyDeanery: string | null = null;
      if (request.specialty_id) {
        const { data: spec } = await supabaseAdmin
          .from("specialties")
          .select("id, short_name, deanery_id, parent_specialty_id")
          .eq("id", request.specialty_id)
          .maybeSingle();
        if (spec) {
          specialtyName = spec.short_name ?? "General";
          specialtyDeanery = spec.deanery_id;
          const { data: facRoles } = await supabaseAdmin
            .from("facilitator_specialties")
            .select("user_id")
            .in("specialty_id", [spec.id, spec.parent_specialty_id].filter(Boolean));
          facilitatorIds = (facRoles ?? []).map((r: { user_id: string }) => r.user_id);
        }
      }
      const requestDeaneries = new Set([request.deanery_id, specialtyDeanery].filter(Boolean));

      const { data: adminRoles } = await supabaseAdmin
        .from("user_roles")
        .select("user_id, role, deanery_id")
        .in("role", ["admin", "super_admin"]);
      const adminIds = (adminRoles ?? [])
        .filter((r: { role: string; deanery_id: string | null }) =>
          r.role === "super_admin" || r.deanery_id === null || requestDeaneries.has(r.deanery_id))
        .map((r: { user_id: string }) => r.user_id);

      const notifyIds = [...new Set([...adminIds, ...facilitatorIds])];
      if (notifyIds.length > 0) {
        const { data: profiles } = await supabaseAdmin
          .from("profiles")
          .select("email")
          .in("user_id", notifyIds);
        const emails = (profiles ?? [])
          .map((p: { email: string | null }) => p.email)
          .filter((e: string | null): e is string => !!e);
        const alertHtml = newRequestAlertHtml(
          name, request.email, specialtyName, request.training_grade ?? undefined,
        );
        if (emails.length === 0) {
          console.warn(
            `No reviewer could be emailed about request ${request.id}: ` +
            `${notifyIds.length} admin/facilitator account(s), none with an email address.`,
          );
        }
        for (const email of emails) {
          try { await sendEmail(email, `New Access Request: ${name}`, alertHtml); }
          catch (e) { console.error("Failed to notify a reviewer:", e); }
        }
      } else {
        // Nothing to send means nobody is watching the queue — say so, rather
        // than returning success on a request no human will ever see.
        console.warn(`No admin or facilitator to notify about access request ${request.id}.`);
      }

      return json({ success: true });
    }

    if (type !== "approved" && type !== "rejected") {
      return json({ error: "Unknown email type" }, 400);
    }

    // Everything below provisions accounts or tells an applicant the outcome of a
    // review, so it requires a signed-in caller who may review THIS request.
    const caller = await getCaller(supabaseAdmin, req);
    if (!caller) return json({ error: "Not authenticated" }, 401);

    const requestId = String(payload.request_id ?? "");
    if (!UUID_RE.test(requestId)) return json({ error: "A request id is required" }, 400);

    const { data: request } = await supabaseAdmin
      .from("access_requests")
      .select("id, first_name, last_name, email, status, specialty_id, deanery_id, review_note")
      .eq("id", requestId)
      .maybeSingle<AccessRequestRow>();
    if (!request) return json({ error: "That request does not exist" }, 404);

    if (!await canReviewRequest(supabaseAdmin, caller.id, request)) {
      return json({ error: "Not authorised to review this request" }, 403);
    }

    // The reviewer records the decision on the row first; this only acts on a
    // decision that has actually been recorded, and only the one recorded.
    if (request.status !== type) {
      return json({ error: `That request is ${request.status}, not ${type}` }, 409);
    }

    const applicantEmail = request.email.trim().toLowerCase();
    const applicantName = `${request.first_name ?? ""} ${request.last_name ?? ""}`.trim().slice(0, MAX_NAME);
    if (!EMAIL_RE.test(applicantEmail)) {
      return json({ error: "The request does not hold a valid email address" }, 422);
    }

    if (type === "approved") {
      const firstName = request.first_name ?? "";
      const lastName = request.last_name ?? "";

      let userId: string | undefined;

      // 1. Check if user already exists
      const existingUser = await findUserByEmail(supabaseAdmin, applicantEmail);

      if (existingUser) {
        console.log(`User ${applicantEmail} already exists, skipping creation.`);
        userId = existingUser.id;
      } else {
        // Create new user account
        const tempPassword = crypto.randomUUID() + "!Aa1";
        const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
          email: applicantEmail,
          password: tempPassword,
          email_confirm: true,
          user_metadata: { first_name: firstName, last_name: lastName },
        });

        if (createError) {
          console.error("Failed to create user:", createError);
          throw new Error(`Failed to create user account: ${createError.message}`);
        }
        userId = newUser?.user?.id;
      }

      // 2. Assign trainee to the specialty the request was for
      if (userId && request.specialty_id) {
        const { error: assignError } = await supabaseAdmin.from("trainee_specialties").insert({
          user_id: userId,
          specialty_id: request.specialty_id,
        });
        if (assignError && !assignError.message?.includes("duplicate")) {
          console.error("Failed to assign specialty:", assignError);
        }
      }

      // 2b. Record the request's deanery on the profile
      if (userId && request.deanery_id) {
        const { error: deaneryError } = await supabaseAdmin
          .from("profiles")
          .update({ deanery_id: request.deanery_id })
          .eq("user_id", userId);
        if (deaneryError) {
          console.error("Failed to set deanery on profile:", deaneryError);
        }
      }

      // 3. Generate a password reset link so user can set their own password
      const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
        type: "recovery",
        email: applicantEmail,
      });

      const resetLink = (!linkError && linkData?.properties?.action_link)
        ? linkData.properties.action_link
        : "#";

      await sendEmail(
        applicantEmail,
        "Access Approved — HST Training Hub",
        approvedHtml(applicantName, resetLink),
      );

      return json({ success: true, user_id: userId });
    }

    const reason = (request.review_note ?? "").trim().slice(0, MAX_NOTE) || "No reason provided.";
    await sendEmail(applicantEmail, "Access Request Update — HST Training Hub", rejectedHtml(applicantName, reason));
    return json({ success: true });
  } catch (error) {
    console.error("Email function error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return json({ error: message }, 500);
  }
});
