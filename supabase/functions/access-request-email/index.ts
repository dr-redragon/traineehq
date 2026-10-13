import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { details, esc, paragraph, renderEmail, small } from "./email-layout.ts";

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
  /**
   * approved only, optional: what the reviewer chose to give the new account
   * in place of what the request asked for. Admins only; checked against what
   * this caller may grant before anything is applied.
   */
  grant?: { role?: string; deanery_id?: string | null; specialty_ids?: string[] };
}

type GrantRole = "trainee" | "facilitator" | "admin" | "super_admin";
interface Grant { role: GrantRole; deaneryId: string | null; specialtyIds: string[] }

interface AccessRequestRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  status: "pending" | "approved" | "rejected";
  specialty_id: string | null;
  deanery_id: string | null;
  review_note: string | null;
  /** Set when a register owner asked for this account (20261012150000). */
  register_id: string | null;
  register_role: "owner" | "editor" | null;
  requested_by: string | null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function getSupabaseAdmin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
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

  // Approving a register's account request makes somebody a facilitator, so
  // only admins decide those — never another facilitator (20261012150000).
  if (specialty && !request.register_id && held.some((r) => r.role === "facilitator")) {
    const { data: facilitates } = await admin
      .from("facilitator_specialties")
      .select("specialty_id")
      .eq("user_id", callerId)
      .in("specialty_id", [specialty.id, specialty.parent_specialty_id].filter(Boolean));
    if ((facilitates ?? []).length > 0) return true;
  }

  return false;
}

/**
 * Check a reviewer's chosen set-up for a new account against what they may
 * grant — the same rules invite-user applies to an invitation, because this is
 * an invitation in all but name. Returns the grant, or a reason to refuse it.
 */
async function checkGrant(
  admin: ReturnType<typeof getSupabaseAdmin>, callerId: string, raw: EmailPayload["grant"],
): Promise<Grant | string> {
  const role = String(raw?.role ?? "trainee") as GrantRole;
  if (!["trainee", "facilitator", "admin", "super_admin"].includes(role)) return "That role does not exist";
  const deaneryId = raw?.deanery_id ? String(raw.deanery_id) : null;
  if (deaneryId && !UUID_RE.test(deaneryId)) return "That deanery does not exist";
  const specialtyIds = [...new Set((Array.isArray(raw?.specialty_ids) ? raw.specialty_ids : []).map(String))];
  if (specialtyIds.some((id) => !UUID_RE.test(id)) || specialtyIds.length > 200) return "Invalid specialties";

  const { data: roles } = await admin.from("user_roles").select("role, deanery_id").eq("user_id", callerId);
  const held = (roles ?? []) as { role: string; deanery_id: string | null }[];
  const isSuper = held.some((r) => r.role === "super_admin");
  const isGlobal = isSuper || held.some((r) => r.role === "admin" && r.deanery_id === null);
  const adminOf = new Set(held.filter((r) => r.role === "admin" && r.deanery_id).map((r) => r.deanery_id as string));
  if (!isGlobal && adminOf.size === 0) return "Only administrators can change what an approval grants";

  if (role === "super_admin" && !isSuper) return "Only super admins can make somebody a super admin";
  if (role === "admin" && deaneryId === null && !isSuper) return "Only super admins can create an admin for every deanery";
  if (deaneryId === null ? !isGlobal : !(isGlobal || adminOf.has(deaneryId))) {
    return "You can only place people in a deanery you administer";
  }

  if (role === "trainee" || role === "facilitator") {
    if (specialtyIds.length && !deaneryId) return "Choose a deanery for those specialties";
    if (specialtyIds.length) {
      const { data: specs } = await admin
        .from("specialties").select("id, deanery_id").in("id", specialtyIds);
      if ((specs ?? []).length !== specialtyIds.length ||
          (specs ?? []).some((sp: { deanery_id: string }) => sp.deanery_id !== deaneryId)) {
        return "Every specialty must belong to the chosen deanery";
      }
    }
  }
  return { role, deaneryId, specialtyIds: role === "trainee" || role === "facilitator" ? specialtyIds : [] };
}

/**
 * Give an account what the reviewer chose. Adds to whatever they already
 * hold — approving a request never takes access away.
 */
async function applyGrant(
  admin: ReturnType<typeof getSupabaseAdmin>, userId: string, grant: Grant,
): Promise<string> {
  const { role, deaneryId, specialtyIds } = grant;
  // Every account keeps its trainee row (the signup trigger adds one); give it the deanery.
  await admin.from("user_roles").upsert(
    { user_id: userId, role: "trainee", deanery_id: deaneryId },
    { onConflict: "user_id,role" },
  );
  if (role !== "trainee") {
    const { error } = await admin.from("user_roles").upsert(
      { user_id: userId, role, deanery_id: role === "super_admin" ? null : deaneryId },
      { onConflict: "user_id,role" },
    );
    if (error) throw new Error(`Could not grant the ${role} role: ${error.message}`);
  }
  if (specialtyIds.length) {
    const table = role === "facilitator" ? "facilitator_specialties" : "trainee_specialties";
    const { error } = await admin.from(table).upsert(
      specialtyIds.map((sid) => ({ user_id: userId, specialty_id: sid })),
      { onConflict: "user_id,specialty_id", ignoreDuplicates: true },
    );
    if (error) throw new Error(`Could not assign specialties: ${error.message}`);
  }
  if (deaneryId) {
    await admin.from("profiles").update({ deanery_id: deaneryId }).eq("user_id", userId);
  }

  const label = { trainee: "a trainee", facilitator: "a facilitator", admin: "an administrator", super_admin: "a super admin" }[role];
  if (!specialtyIds.length) return `You have been set up as ${label}.`;
  const { data: names } = await admin.from("specialties").select("short_name").in("id", specialtyIds);
  const list = (names ?? []).map((n: { short_name: string }) => `<strong>${esc(n.short_name)}</strong>`).join(", ");
  return `You have been set up as ${label} with access to ${list}.`;
}

/**
 * Make somebody a facilitator of a specialty: the role, in its deanery, and
 * the specialty itself. Never narrows anything they already hold.
 */
async function grantFacilitator(
  admin: ReturnType<typeof getSupabaseAdmin>, userId: string, deaneryId: string | null, specialtyId: string,
): Promise<string | null> {
  const { data: specialty } = await admin
    .from("specialties").select("id, short_name, deanery_id").eq("id", specialtyId).maybeSingle();
  if (!specialty) return null;
  const { error: roleErr } = await admin.from("user_roles").upsert(
    { user_id: userId, role: "facilitator", deanery_id: deaneryId ?? specialty.deanery_id },
    { onConflict: "user_id,role", ignoreDuplicates: true },
  );
  if (roleErr) { console.error("Failed to grant the facilitator role:", roleErr); return null; }
  const { error: facErr } = await admin.from("facilitator_specialties").upsert(
    { user_id: userId, specialty_id: specialty.id },
    { onConflict: "user_id,specialty_id", ignoreDuplicates: true },
  );
  if (facErr) { console.error("Failed to add the facilitated specialty:", facErr); return null; }
  return specialty.short_name ?? "your specialty";
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

type NotificationKind = "account_requests" | "register_account_requests" | "specialty_requests";

/**
 * Of the people who would be told about a request, the ones who still want
 * to be: anyone who has turned this kind of email off, or narrowed their
 * emails to deaneries this request is not in, is left out. No preferences row
 * means the defaults, everything on for every deanery
 * (20261013100000_notification_preferences).
 */
async function wantingEmail(
  admin: ReturnType<typeof getSupabaseAdmin>,
  userIds: string[],
  kind: NotificationKind,
  requestDeaneries: (string | null | undefined)[],
): Promise<string[]> {
  if (!userIds.length) return [];
  const { data, error } = await admin
    .from("notification_preferences")
    .select("user_id, account_requests, register_account_requests, specialty_requests, deanery_ids")
    .in("user_id", userIds);
  // Fail open: a reviewer missing an email is worse than one they did not want.
  if (error) { console.error("notification_preferences read failed:", error); return userIds; }

  const deaneries = requestDeaneries.filter((d): d is string => !!d);
  const prefs = new Map((data ?? []).map((p: Record<string, unknown>) => [p.user_id as string, p]));
  return userIds.filter((id) => {
    const p = prefs.get(id);
    if (!p) return true;
    if (p[kind] === false) return false;
    const only = p.deanery_ids as string[] | null;
    // A request with no deanery at all is never filtered out by deanery.
    if (only && deaneries.length && !deaneries.some((d) => only.includes(d))) return false;
    return true;
  });
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
  return renderEmail({
    kicker: "Specialty access request",
    heading: `${name} asked to join ${specialty}`,
    preheader: `${name} has asked to join ${specialty}.`,
    body: details([["Name", name], ["Email", email], ["Specialty", specialty]]) +
      paragraph("Review it in the Admin Panel or the Facilitator Panel."),
    // The same email goes to admins and facilitators, whose review pages differ.
    button: { label: "Open TraineeHQ", url: `${siteUrl.replace(/\/+$/, "")}/dashboard` },
    notice: reason ? `<strong>Their reason:</strong><br>${esc(reason)}` : undefined,
    reason: "You're receiving this because you can review requests for this specialty. " +
      "You can change which requests you're emailed about on your profile page.",
  });
}

function specialtyRequestReceivedHtml(name: string, specialty: string) {
  return renderEmail({
    kicker: "Request received",
    heading: "Your request has been sent",
    preheader: `Your request to join ${specialty} is with the reviewers.`,
    body: paragraph(`Hi ${esc(name)},`) +
      paragraph(`Your request to join <strong>${esc(specialty)}</strong> has been sent for review. ` +
        "You'll get another email once it has been decided."),
    reason: "You're receiving this because you asked for access to a specialty on TraineeHQ.",
  });
}

function specialtyRequestDecidedHtml(
  name: string, specialty: string, approved: boolean, note: string | null,
) {
  return renderEmail({
    kicker: approved ? "Request approved" : "Request update",
    heading: approved ? `You now have access to ${specialty}` : "Your request was not approved",
    preheader: approved ? `You can now see ${specialty}.` : `An update on your request to join ${specialty}.`,
    body: paragraph(`Hi ${esc(name)},`) +
      paragraph(approved
        ? `Your request to join <strong>${esc(specialty)}</strong> has been approved. It appears in your ` +
          "sidebar the next time you sign in or refresh the page."
        : `Your request to join <strong>${esc(specialty)}</strong> was not approved at this time.`),
    button: approved ? { label: "Open TraineeHQ", url: `${SITE_URL}/dashboard` } : undefined,
    notice: note ? `<strong>Note from the reviewer:</strong><br>${esc(note)}` : undefined,
    reason: "You're receiving this because you asked for access to a specialty on TraineeHQ.",
  });
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
    const notifyIds = await wantingEmail(
      admin,
      [...new Set([...adminIds, ...(facs ?? []).map((f: { user_id: string }) => f.user_id)])]
        .filter((id) => id !== request.user_id),
      "specialty_requests",
      [spec?.deanery_id],
    );

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
        `Request received: ${specialtyName} — TraineeHQ`,
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
      ? `Access approved: ${specialtyName} — TraineeHQ`
      : `Specialty access request update — TraineeHQ`,
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
  return renderEmail({
    kicker: "Account",
    heading: "You already have an account",
    preheader: "This email address already has a TraineeHQ account.",
    body: paragraph("Somebody asked for access to <strong>TraineeHQ</strong> with this email address, but it " +
      "already has an account. If that was you, set a new password and sign in."),
    button: { label: "Set a new password", url: resetLink },
    reason: "You're receiving this because this address was entered on the Request access form. " +
      "If it wasn't you, you can ignore this email; nothing has changed.",
  });
}

function submissionConfirmationHtml(name: string) {
  return renderEmail({
    kicker: "Request received",
    heading: "Thanks for requesting access",
    preheader: "Your request is with the administrators.",
    body: paragraph(`Hi ${esc(name)},`) +
      paragraph("Thank you for requesting access to <strong>TraineeHQ</strong>. Your application has been " +
        "received and will be reviewed by an administrator.") +
      paragraph("You'll receive another email once it has been reviewed."),
    reason: "You're receiving this because this address was entered on the TraineeHQ Request access form.",
  });
}

function requestedForYouHtml(name: string, requester: string, registerName: string) {
  return renderEmail({
    kicker: "Account requested",
    heading: "An account has been requested for you",
    preheader: `${requester} asked for a TraineeHQ account for you.`,
    body: paragraph(`Hi ${esc(name)},`) +
      paragraph(`${esc(requester)} has asked for an account on <strong>TraineeHQ</strong> for you, so that ` +
        `you can help run the <strong>${esc(registerName)}</strong> teaching register.`) +
      paragraph("An administrator will review it, and you'll receive another email with a link to set your " +
        "password once it is approved."),
    reason: "You're receiving this because a register owner asked for an account for this address. " +
      "If you weren't expecting it, you can ignore this email.",
  });
}

function newRequestAlertHtml(
  name: string, email: string, specialty: string, grade?: string,
  forRegister?: { registerName: string; requester: string; reason: string | null },
) {
  return renderEmail({
    kicker: forRegister ? "Account request for a register" : "New account request",
    heading: `${name} has asked for an account`,
    preheader: `${name} is waiting for an account on TraineeHQ.`,
    body: details([
        ["Name", name], ["Email", email], ["Specialty", specialty], ["Grade", grade],
        ["Register", forRegister ? `${forRegister.registerName}, requested by ${forRegister.requester}` : undefined],
      ]) +
      (forRegister
        ? paragraph("Approving it creates the account, adds them to the register and makes them a " +
            `<strong>facilitator of ${esc(specialty)}</strong>. Only admins can decide it.`)
        : paragraph("Review it in the Admin Panel, or the Facilitator Panel if it is for your specialty.")),
    button: { label: "Open TraineeHQ", url: `${SITE_URL}/dashboard` },
    notice: forRegister?.reason ? `<strong>Their reason:</strong><br>${esc(forRegister.reason)}` : undefined,
    reason: "You're receiving this because you can review account requests for this deanery. " +
      "You can change which requests you're emailed about on your profile page.",
  });
}

function approvedHtml(name: string, resetLink: string, extra?: string) {
  return renderEmail({
    kicker: "Access approved",
    heading: "Welcome to TraineeHQ",
    preheader: "Your access request has been approved. Set your password to sign in.",
    body: paragraph(`Hi ${esc(name)},`) +
      paragraph("Your access request for <strong>TraineeHQ</strong> has been approved.") +
      (extra ? paragraph(extra) : "") +
      paragraph("Set your password to activate your account and sign in."),
    button: { label: "Set your password", url: resetLink },
    notice: "This link expires in 24 hours. If it does, use \"Forgot password\" on the sign-in page.",
    reason: "You're receiving this because you requested access to TraineeHQ.",
  });
}

function rejectedHtml(name: string, reason: string) {
  return renderEmail({
    kicker: "Request update",
    heading: "Your request was not approved",
    preheader: "An update on your TraineeHQ access request.",
    body: paragraph(`Hi ${esc(name)},`) +
      paragraph("Unfortunately, your access request for TraineeHQ was not approved at this time.") +
      small("If you believe this was in error, please contact your training programme director."),
    notice: `<strong>Reason:</strong><br>${esc(reason)}`,
    reason: "You're receiving this because you requested access to TraineeHQ.",
  });
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
        .select("id, first_name, last_name, email, training_grade, reason, specialty_id, deanery_id, status, confirmation_sent_at, register_id, requested_by")
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
              await sendEmail(applicantEmail, "You already have an account — TraineeHQ", existingAccountHtml(link));
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

      // A request a register owner filed for a colleague says so, to both.
      let forRegister: { registerName: string; requester: string; reason: string | null } | undefined;
      if (request.register_id) {
        const [{ data: reg }, { data: requester }] = await Promise.all([
          supabaseAdmin.from("registers").select("name").eq("id", request.register_id).maybeSingle(),
          request.requested_by
            ? supabaseAdmin.from("profiles").select("first_name, last_name").eq("user_id", request.requested_by).maybeSingle()
            : Promise.resolve({ data: null }),
        ]);
        forRegister = {
          registerName: reg?.name ?? "a teaching register",
          requester: [requester?.first_name, requester?.last_name].filter(Boolean).join(" ") || "A register owner",
          reason: request.reason ?? null,
        };
      }

      await sendEmail(
        request.email,
        forRegister
          ? "An account has been requested for you — TraineeHQ"
          : "Access Request Received — TraineeHQ",
        forRegister
          ? requestedForYouHtml(name, forRegister.requester, forRegister.registerName)
          : submissionConfirmationHtml(name),
      );

      // Notify the people who can review it: super admins, global admins, the
      // admins of the request's deanery, and the specialty's facilitators — the
      // same people canReviewRequest() lets decide it. Not every admin on the
      // platform: an admin of another deanery has no business with this one.
      let facilitatorIds: string[] = [];
      let specialtyName = "General";
      let specialtyDeanery: string | null = null;
      // Only admins decide a register's account request, so only they are told.
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
          facilitatorIds = request.register_id
            ? []
            : (facRoles ?? []).map((r: { user_id: string }) => r.user_id);
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

      const notifyIds = await wantingEmail(
        supabaseAdmin,
        [...new Set([...adminIds, ...facilitatorIds])],
        forRegister ? "register_account_requests" : "account_requests",
        [...requestDeaneries] as string[],
      );
      if (notifyIds.length > 0) {
        const { data: profiles } = await supabaseAdmin
          .from("profiles")
          .select("email")
          .in("user_id", notifyIds);
        const emails = (profiles ?? [])
          .map((p: { email: string | null }) => p.email)
          .filter((e: string | null): e is string => !!e);
        const alertHtml = newRequestAlertHtml(
          name, request.email, specialtyName, request.training_grade ?? undefined, forRegister,
        );
        if (emails.length === 0) {
          console.warn(
            `No reviewer could be emailed about request ${request.id}: ` +
            `${notifyIds.length} admin/facilitator account(s), none with an email address.`,
          );
        }
        for (const email of emails) {
          try {
            await sendEmail(
              email,
              forRegister ? `Account request for the ${forRegister.registerName} register: ${name}` : `New Access Request: ${name}`,
              alertHtml,
            );
          }
          catch (e) { console.error("Failed to notify a reviewer:", e); }
        }
      } else {
        // Nothing to send means nobody is watching the queue — say so, rather
        // than returning success on a request no human will ever see.
        console.warn(`No admin or facilitator to notify about access request ${request.id} ` +
          "(or all of them have turned these emails off).");
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
      .select("id, first_name, last_name, email, status, specialty_id, deanery_id, review_note, register_id, register_role, requested_by")
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

    // A reviewer's own choice of role, deanery and specialties, checked before
    // any account is made so a refused choice leaves nothing half done.
    let grant: Grant | null = null;
    if (type === "approved" && payload.grant) {
      const checked = await checkGrant(supabaseAdmin, caller.id, payload.grant);
      if (typeof checked === "string") return json({ error: checked }, 403);
      grant = checked;
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

      // 2. Assign trainee to the specialty the request was for. A register's
      //    account request instead makes them a facilitator of it, and adds
      //    them to the register (20261012150000).
      let extra: string | undefined;
      // An existing account is somebody the reviewer may not administer; only
      // change their roles if they could have done so in the Users tab.
      if (grant && userId && existingUser) {
        const { data: allowed } = await supabaseAdmin.rpc("can_admin_user", { _admin: caller.id, _target: userId });
        if (allowed !== true) {
          return json({ error: "That email already has an account you do not administer" }, 403);
        }
      }
      const granted = grant && userId ? await applyGrant(supabaseAdmin, userId, grant) : undefined;

      if (userId && request.register_id) {
        const facilitates = request.specialty_id && !grant
          ? await grantFacilitator(supabaseAdmin, userId, request.deanery_id, request.specialty_id)
          : null;
        const { data: reg } = await supabaseAdmin
          .from("registers").select("id, name").eq("id", request.register_id).maybeSingle();
        if (reg) {
          const { error: memberErr } = await supabaseAdmin.from("register_members").upsert(
            {
              register_id: reg.id, user_id: userId, role: request.register_role ?? "editor",
              granted_by: request.requested_by ?? caller.id,
            },
            { onConflict: "register_id,user_id", ignoreDuplicates: true },
          );
          if (memberErr) console.error("Failed to add them to the register:", memberErr);
        }
        extra = [
          reg ? `You have been added to the <strong>${esc(reg.name)}</strong> teaching register.` : "",
          facilitates ? `You are a facilitator of <strong>${esc(facilitates)}</strong>.` : "",
          granted ?? "",
        ].filter(Boolean).join(" ") || undefined;
      } else if (granted) {
        extra = granted;
      } else if (userId && request.specialty_id) {
        const { error: assignError } = await supabaseAdmin.from("trainee_specialties").insert({
          user_id: userId,
          specialty_id: request.specialty_id,
        });
        if (assignError && !assignError.message?.includes("duplicate")) {
          console.error("Failed to assign specialty:", assignError);
        }
      }

      // 2b. Record the request's deanery on the profile
      if (userId && request.deanery_id && !grant) {
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

      // The account exists now whatever happens to the email, so a failed send
      // is reported, not thrown: an error here would read as "not approved".
      try {
        await sendEmail(
          applicantEmail,
          "Access Approved — TraineeHQ",
          approvedHtml(applicantName, resetLink, extra),
        );
      } catch (e) {
        console.error("Approval email failed:", e);
        return json({ success: true, user_id: userId, email_sent: false });
      }

      return json({ success: true, user_id: userId, email_sent: true });
    }

    const reason = (request.review_note ?? "").trim().slice(0, MAX_NOTE) || "No reason provided.";
    await sendEmail(applicantEmail, "Access Request Update — TraineeHQ", rejectedHtml(applicantName, reason));
    return json({ success: true });
  } catch (error) {
    console.error("Email function error:", error);
    return json({ error: "Something went wrong" }, 500);
  }
});
