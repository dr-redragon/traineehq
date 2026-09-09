// The teaching register's server-side API, multi-tenant.
//
// One function, action-routed, ported from the standalone register. Three tiers
// of caller, and the middle one is what this port is really about:
//
//   anon    check-in and submit-feedback. Authority is the session link and
//           nothing else. The register is always derived from the session id.
//   member  everything an organiser does. The standalone register's test was
//           "is this a signed-in user", because there was one register and
//           anybody signed in ran it. Here it is "is this user a member of the
//           register this action touches", checked per call.
//   —       certificates and outbound email are not ported yet; see the bottom.
//
// It runs under the service role, which bypasses row-level security entirely.
// Every rule RLS would have applied is therefore re-checked here in code: a
// check missing in this file is a check that does not happen.
//
// ANONYMITY: submit-feedback passes the trainee's identifier to
// register_record_feedback() purely so it can flip the attendee's
// feedback_completed gate. It is never written to register_feedback, and nothing
// here reads a feedback row alongside a name or an address.
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4?target=deno";
import {
  emailConfigured, explainFailure, fromEmail, sendEmail, usingSandboxSender,
} from "./email.ts";

// Where the feedback link in an outbound email points. Derived from the
// environment, never from the request: a member could otherwise have the
// training hub's own sender mail a link of their choosing to every trainee on
// the register.
const APP_BASE_URL = (Deno.env.get("APP_BASE_URL") || "https://traineehq.com").replace(/\/+$/, "");

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  // Without this the browser re-runs the preflight before EVERY call, and each
  // one is a full round trip to a possibly cold isolate — measured at 180-1260ms
  // on the original, roughly doubling the cost of every organiser action.
  "Access-Control-Max-Age": "86400",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

let _service: SupabaseClient | null = null;
function service(): SupabaseClient {
  return _service ??= createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

const cleanEmail = (v: unknown) => String(v ?? "").trim().toLowerCase();
const cleanText = (v: unknown, max = 300) => String(v ?? "").trim().slice(0, max);
const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const isUuid = (v: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
// Organiser-written prose goes into an HTML email, so it is escaped on the way
// in rather than trusted to be plain.
const esc = (v: unknown) => String(v ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// A trainee marked present for whom the register holds no address still needs an
// attendee row, or they cannot appear on the feedback form or be counted.
// `email` is NOT NULL and unique per session, so they get a deliberately
// undeliverable placeholder, recognisable again wherever we would send to it.
const NO_EMAIL_DOMAIN = "@no-email.invalid";
const placeholderEmail = (key: string) =>
  `t${String(key).replace(/[^a-zA-Z0-9]/g, "").slice(0, 40) || "unknown"}${NO_EMAIL_DOMAIN}`;
const isPlaceholderEmail = (v: unknown) =>
  String(v ?? "").toLowerCase().endsWith(NO_EMAIL_DOMAIN);

/** The anonymous feedback page for one teaching day. */
const feedbackUrl = (sessionId: string) =>
  `${APP_BASE_URL}/registers/feedback?s=${encodeURIComponent(sessionId)}`;

function ukDate(value: string): string {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
  });
}

/* ------------------------------------------------------------------- callers */

async function signedInUser(req: Request): Promise<{ id: string } | null> {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  const { data, error } = await service().auth.getUser(token);
  return error || !data?.user ? null : { id: data.user.id };
}

/**
 * The register a session belongs to. The only way an anonymous caller names a
 * register, and deliberately so: they hold a link, not a register id.
 */
async function registerOfSession(db: SupabaseClient, sessionId: string): Promise<string | null> {
  if (!isUuid(sessionId)) return null;
  const { data } = await db.from("register_sessions")
    .select("register_id").eq("id", sessionId).maybeSingle();
  return data?.register_id ?? null;
}

async function isMember(db: SupabaseClient, userId: string, registerId: string): Promise<boolean> {
  const { data } = await db.from("register_members")
    .select("user_id").eq("register_id", registerId).eq("user_id", userId).maybeSingle();
  return !!data;
}

/* --------------------------------------------------------------------- forms */

const QUESTION_TYPES = new Set(["scale", "short", "long", "choice", "checkbox"]);

interface Question {
  id: string; type: string; text: string; required: boolean;
  options?: string[]; lowLabel?: string; highLabel?: string;
  placeholder?: string; locked?: boolean;
}

// Validated here rather than trusted from the editor: the same shape is later
// read by the anonymous feedback page and by the report, and a malformed one
// would break both for everybody.
function cleanForm(raw: unknown): { form: { title: string; questions: Question[] } } | { error: string } {
  if (!raw || typeof raw !== "object") return { error: "The form is missing" };
  const src = raw as Record<string, unknown>;
  const list = Array.isArray(src.questions) ? src.questions : null;
  if (!list) return { error: "The form has no questions" };
  if (!list.length) return { error: "A form needs at least one question" };
  if (list.length > 40) return { error: "That is more than 40 questions" };

  const seen = new Set<string>();
  const questions: Question[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const q = item as Record<string, unknown>;
    const type = String(q.type ?? "scale");
    if (!QUESTION_TYPES.has(type)) return { error: `Unknown question type: ${type}` };

    // Answers are keyed by id, so a duplicate would silently overwrite another
    // question's answers, and an id that changes orphans historic responses.
    let id = cleanText(q.id, 40).replace(/[^a-zA-Z0-9_]/g, "") || `q${questions.length + 1}`;
    while (seen.has(id)) id = `${id}_${questions.length + 1}`;
    seen.add(id);

    const text = cleanText(q.text, 300);
    if (!text) return { error: "Every question needs some text" };

    const out: Question = { id, type, text, required: q.required === true };
    if (type === "choice" || type === "checkbox") {
      const opts = (Array.isArray(q.options) ? q.options : [])
        .map((o) => cleanText(o, 120)).filter(Boolean).slice(0, 20);
      if (opts.length < 2) return { error: `"${text}" needs at least two options` };
      out.options = opts;
    }
    if (type === "scale") {
      out.lowLabel = cleanText(q.lowLabel, 40) || "Strongly disagree";
      out.highLabel = cleanText(q.highLabel, 40) || "Strongly agree";
    }
    if (type === "short" || type === "long") {
      const ph = cleanText(q.placeholder, 120);
      if (ph) out.placeholder = ph;
    }
    if (q.locked === true) out.locked = true;
    questions.push(out);
  }
  if (!questions.length) return { error: "A form needs at least one question" };
  return { form: { title: cleanText(src.title, 120) || "Session feedback", questions } };
}

const DEFAULT_FORM = {
  title: "Session feedback",
  questions: [
    { id: "overall", type: "scale", text: "Overall, how would you rate this session?",
      required: true, lowLabel: "Poor", highLabel: "Excellent", locked: true },
    { id: "content", type: "scale", text: "The content was relevant to my training", required: true,
      lowLabel: "Strongly disagree", highLabel: "Strongly agree" },
    { id: "delivery", type: "scale", text: "The teaching was clear and well delivered", required: true,
      lowLabel: "Strongly disagree", highLabel: "Strongly agree" },
    { id: "comments", type: "long", text: "Anything else you would like to say?", required: false },
  ],
};

/** The register's shared template, seeded on first use. */
async function templateForm(db: SupabaseClient, registerId: string) {
  const { data } = await db.from("register_forms")
    .select("form").eq("register_id", registerId).maybeSingle();
  if (data?.form) return data.form;

  await db.from("register_forms")
    .upsert({ register_id: registerId, form: DEFAULT_FORM }, { onConflict: "register_id" });
  return DEFAULT_FORM;
}

/* ------------------------------------------------------------------ handlers */

async function handleCheckIn(db: SupabaseClient, body: Record<string, unknown>) {
  const sessionId = cleanText(body.session_id, 64);
  const name = cleanText(body.name, 120);
  const typedEmail = cleanEmail(body.email);
  const grade = cleanText(body.grade, 40) || null;
  let traineeId = cleanText(body.local_trainee_id, 64) || null;

  if (!sessionId || !name) return json({ error: "Session and name are required" }, 400);

  const { data: session } = await db.from("register_sessions")
    .select("id, register_id, title, session_date, local_id")
    .eq("id", sessionId).maybeSingle();
  if (!session) return json({ error: "This sign-in link is not valid any more" }, 404);

  // "My name is not on the list" joins the roster here, as they sign in —
  // present for this teaching day and listed for every future one. Matching is
  // by name, so a name already on the roster attaches rather than duplicating.
  let enrolled = false;
  if (!traineeId) {
    const { data: joined, error } = await db.rpc("register_enrol_trainee", {
      _session_id: sessionId, _name: name, _email: typedEmail, _grade: grade ?? "",
    });
    if (error) console.error("register_enrol_trainee failed", error);  // attendee row still stands
    const row = joined as { trainee_id?: string | null; created?: boolean } | null;
    if (row?.trainee_id) traineeId = row.trainee_id;
    enrolled = row?.created === true;
  } else {
    // A supplied id must belong to THIS register. Without the check, a caller
    // could attach their check-in to another register's trainee.
    await db.rpc("register_record_checkin", {
      _session_id: sessionId, _trainee_id: traineeId, _grade: grade ?? "",
    });
  }

  // Resolved server-side: a typed address is saved onto the roster record, a
  // blank one falls back to whatever is on file. The stored address never
  // reaches the browser — it travels only as far as the attendee row.
  let email = typedEmail;
  try {
    const { data: resolved } = await db.rpc("register_resolve_trainee_email", {
      _session_id: sessionId, _trainee_id: traineeId, _email: typedEmail,
    });
    if (typeof resolved === "string" && resolved) email = cleanEmail(resolved);
  } catch (err) {
    console.error("register_resolve_trainee_email failed", err);
  }

  if (!isEmail(email)) return json({ error: "A valid email address is required" }, 400);

  const { data, error } = await db.from("register_attendees")
    .upsert({
      session_id: sessionId, name, email, grade,
      checked_in_at: new Date().toISOString(),
    }, { onConflict: "session_id,email" })
    .select("id, name, email, grade").single();

  if (error) return json({ error: error.message }, 500);
  return json({ ok: true, attendee: data, enrolled, session: { title: session.title } });
}

async function handleSubmitFeedback(db: SupabaseClient, body: Record<string, unknown>) {
  const sessionId = cleanText(body.session_id, 64);
  const identifier = cleanText(body.identifier, 200);
  const overall = Number(body.overall_rating);

  if (!sessionId) return json({ error: "Missing session" }, 400);
  if (!Number.isInteger(overall) || overall < 1 || overall > 5) {
    return json({ error: "Please give an overall rating" }, 400);
  }

  const { data, error } = await db.rpc("register_record_feedback", {
    _session_id: sessionId,
    _identifier: identifier,
    _overall: overall,
    _answers: (body.answers && typeof body.answers === "object") ? body.answers : {},
    _comments: String(body.comments ?? "").trim().slice(0, 4000),
  });

  if (error) {
    console.error("register_record_feedback failed", error);
    return json({ error: "Could not save your feedback — please try again" }, 500);
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row || row.status === "unknown_session") {
    return json({ error: "This feedback link is not valid any more" }, 404);
  }
  if (row.status === "already_submitted") {
    return json({ ok: true, status: "already_submitted" });
  }
  // Feedback is kept either way; "unmatched" simply means there is nobody to
  // issue a certificate to once certificates are ported.
  return json({ ok: true, status: "recorded", matched: row.status === "recorded" });
}

async function handleCreateSession(
  db: SupabaseClient, registerId: string, body: Record<string, unknown>,
) {
  const title = cleanText(body.title, 200);
  const sessionDate = cleanText(body.session_date, 10);
  const location = cleanText(body.location, 200) || null;
  const localId = cleanText(body.local_id, 64) || null;

  if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(sessionDate)) {
    return json({ error: "A title and a valid date are required" }, 400);
  }

  // Publishing the same teaching day twice updates it rather than making a
  // second QR code for the same afternoon.
  if (localId) {
    const { data: existing } = await db.from("register_sessions")
      .select("id").eq("register_id", registerId).eq("local_id", localId).maybeSingle();

    if (existing) {
      const { data, error } = await db.from("register_sessions")
        .update({ title, session_date: sessionDate, location })
        .eq("id", existing.id).select("*").single();
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true, session: data, created: false });
    }
  }

  const { data, error } = await db.from("register_sessions")
    .insert({
      register_id: registerId, title, session_date: sessionDate, location,
      local_id: localId, form: await templateForm(db, registerId),
    })
    .select("*").single();

  if (error) return json({ error: error.message }, 500);
  return json({ ok: true, session: data, created: true });
}

async function handleSessionStatus(db: SupabaseClient, sessionId: string) {
  const { data: session } = await db.from("register_sessions")
    .select("*").eq("id", sessionId).maybeSingle();
  if (!session) return json({ error: "Unknown session" }, 404);

  const { data: attendees, error } = await db.from("register_attendees")
    .select("id, name, email, grade, checked_in_at, feedback_completed, certificate_sent_at")
    .eq("session_id", sessionId).order("name");
  if (error) return json({ error: error.message }, 500);

  const { count } = await db.from("register_feedback")
    .select("id", { count: "exact", head: true }).eq("session_id", sessionId);

  // Said here rather than discovered on a failed send: whether mail can go out
  // at all, and whether it is still going out from Resend's shared test address
  // — which reports every send as a success and delivers to nobody.
  return json({
    ok: true, session, attendees, feedback_count: count ?? 0,
    email_configured: emailConfigured(),
    email_sandbox: usingSandboxSender(),
    email_from: fromEmail(),
  });
}

/**
 * Email the feedback form to people who signed in and have not answered.
 *
 * The link is the same anonymous one the QR-adjacent feedback page uses; the
 * addresses come from the attendee rows, never from the request. Anyone marked
 * present with no address on file carries a placeholder, so they are reported
 * by name instead of counted as a failure.
 */
async function handleEmailFeedbackLink(
  db: SupabaseClient, sessionId: string, body: Record<string, unknown>,
) {
  if (!emailConfigured()) {
    return json({ error: "Email is not configured yet (RESEND_API_KEY is not set)" }, 400);
  }

  const ids = Array.isArray(body.attendee_ids) ? body.attendee_ids.map((v) => String(v)) : [];

  const { data: session } = await db.from("register_sessions")
    .select("id, title, session_date").eq("id", sessionId).maybeSingle();
  if (!session) return json({ error: "Unknown session" }, 404);

  let q = db.from("register_attendees")
    .select("id, name, email, checked_in_at, feedback_completed")
    .eq("session_id", sessionId)
    .not("checked_in_at", "is", null)
    .eq("feedback_completed", false);
  if (ids.length) q = q.in("id", ids);

  const { data: all, error } = await q;
  if (error) return json({ error: error.message }, 500);

  const targets = (all ?? []).filter((t) => !isPlaceholderEmail(t.email));
  const failures: { name: string; email: string; why: string }[] = (all ?? [])
    .filter((t) => isPlaceholderEmail(t.email))
    .map((t) => ({
      name: t.name, email: "",
      why: "No email on file — add one under Trainees & days, then send again.",
    }));

  const url = feedbackUrl(sessionId);
  const dateLabel = ukDate(session.session_date);

  let sent = 0;
  for (const t of targets) {
    const res = await sendEmail({
      to: t.email,
      subject: `Feedback for ${session.title} — and your certificate`,
      html: `<div style="font-family:Segoe UI,system-ui,sans-serif;font-size:15px;color:#15211c;line-height:1.55">
        <p>Dear ${esc(t.name)},</p>
        <p>Thank you for attending <strong>${esc(session.title)}</strong> on ${esc(dateLabel)}.</p>
        <p>Please complete the short feedback form below. It is anonymous — your answers are stored
           with no name or address attached. Once it is submitted, your certificate of attendance
           follows automatically.</p>
        <p><a href="${url}" style="display:inline-block;background:#2c4d39;color:#fff;text-decoration:none;padding:11px 20px;border-radius:8px;font-weight:600">Give feedback and get your certificate</a></p>
        <p style="color:#7a7568;font-size:13px">Or paste this into your browser: ${url}</p>
      </div>`,
      text: `Dear ${t.name},\n\nThank you for attending ${session.title} on ${dateLabel}. ` +
        `Please complete the anonymous feedback form to receive your certificate:\n${url}`,
    });
    if (res.ok) sent++;
    else failures.push({ name: t.name, email: t.email, why: explainFailure(res.reason) });
  }

  return json({
    ok: true, sent, considered: (all ?? []).length, failures,
    sandbox: usingSandboxSender(), from: fromEmail(),
  });
}

/**
 * Ask a group of trainees why they were not at a teaching day.
 *
 * Who is absent-without-explanation is worked out in the browser, because
 * eligibility, excusals and long-term status all live in the register blob and
 * none of them exist in these tables. Only the addresses arrive here — and they
 * are checked against this session's own register before anything is sent, so
 * a member cannot use the hub's sender to mail an address of their choosing.
 */
async function handleChaseAbsences(
  db: SupabaseClient, registerId: string, body: Record<string, unknown>,
) {
  if (!emailConfigured()) {
    return json({ error: "Email is not configured yet (RESEND_API_KEY is not set)" }, 400);
  }

  const subject = cleanText(body.subject, 300);
  const message = String(body.body ?? "").trim().slice(0, 8000);
  const replyTo = (Array.isArray(body.reply_to) ? body.reply_to : [])
    .map(cleanEmail).filter(isEmail).slice(0, 4);
  const asked = [...new Set(
    (Array.isArray(body.recipients) ? body.recipients : []).map(cleanEmail).filter(isEmail),
  )];

  if (!subject) return json({ error: "The email needs a subject" }, 400);
  if (!message) return json({ error: "The email needs a message" }, 400);
  if (!asked.length) return json({ error: "Nobody to send to" }, 400);
  if (asked.length > 200) return json({ error: "That is more than 200 recipients — split it up" }, 400);

  // Every address has to belong to a trainee on this register's own roster.
  const { data: store } = await db.from("register_stores")
    .select("data").eq("register_id", registerId).maybeSingle();
  const roster = new Set(
    ((store?.data as { trainees?: { email?: string }[] } | null)?.trainees ?? [])
      .map((t) => cleanEmail(t?.email)).filter(Boolean),
  );
  const recipients = asked.filter((e) => roster.has(e));
  const refused = asked.filter((e) => !roster.has(e));
  if (!recipients.length) {
    return json({ error: "None of those addresses are on this register's roster" }, 400);
  }

  // Everyone goes in BCC so recipients cannot see one another. The visible To:
  // is the sending identity itself, which is the usual way to do this.
  const visibleTo = fromEmail();
  const html = `<div style="font-family:Segoe UI,system-ui,sans-serif;font-size:15px;color:#15211c;line-height:1.55">` +
    message.split(/\n{2,}/).map((p) => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`).join("") +
    `</div>`;

  // Resend caps one message at 50 recipients, so this goes out in batches.
  const BATCH = 45;
  let sent = 0;
  const failures: { batch: number; why: string }[] = [];
  for (let i = 0; i < recipients.length; i += BATCH) {
    const slice = recipients.slice(i, i + BATCH);
    const res = await sendEmail({
      to: visibleTo, bcc: slice, subject, html, text: message,
      replyTo: replyTo.length ? replyTo : undefined,
    });
    if (res.ok) sent += slice.length;
    else failures.push({ batch: Math.floor(i / BATCH) + 1, why: explainFailure(res.reason) });
  }

  return json({
    ok: true, sent, considered: recipients.length, failures, not_on_roster: refused.length,
    sandbox: usingSandboxSender(), from: visibleTo, reply_to: replyTo,
  });
}

async function handleMarkAttended(
  db: SupabaseClient, sessionId: string, body: Record<string, unknown>,
) {
  const checkedIn = body.checked_in !== false;
  const list = Array.isArray(body.trainees) ? body.trainees : [];
  if (!list.length) return json({ ok: true, marked: 0, no_email: [] });

  let marked = 0;
  const noEmail: string[] = [];

  for (const raw of list) {
    const item = (raw && typeof raw === "object") ? raw as Record<string, unknown> : {};
    const name = cleanText(item.name, 120);
    const localId = cleanText(item.local_trainee_id, 64) || null;
    const grade = cleanText(item.grade, 40) || null;
    if (!name) continue;

    let email = cleanEmail(item.email);
    if (!isEmail(email) && localId) {
      try {
        const { data: resolved } = await db.rpc("register_resolve_trainee_email", {
          _session_id: sessionId, _trainee_id: localId, _email: null,
        });
        if (typeof resolved === "string" && resolved) email = cleanEmail(resolved);
      } catch (err) { console.error("register_resolve_trainee_email failed", err); }
    }
    if (!isEmail(email)) { email = placeholderEmail(localId || name); noEmail.push(name); }

    if (!checkedIn) {
      // Un-ticking clears the check-in rather than deleting the row, so any
      // feedback already recorded against them survives.
      await db.from("register_attendees").update({ checked_in_at: null })
        .eq("session_id", sessionId).eq("email", email);
      marked++;
      continue;
    }

    const { error } = await db.from("register_attendees").upsert({
      session_id: sessionId, name, email, grade,
      checked_in_at: new Date().toISOString(),
    }, { onConflict: "session_id,email" });

    if (!error) marked++;
    if (localId) {
      await db.rpc("register_record_checkin", {
        _session_id: sessionId, _trainee_id: localId, _grade: grade ?? "",
      });
    }
  }

  return json({ ok: true, marked, no_email: noEmail });
}

async function handleGetForm(db: SupabaseClient, registerId: string, sessionId: string | null) {
  const template = await templateForm(db, registerId);
  if (!sessionId) return json({ ok: true, form: template, source: "template", template });

  const { data: session } = await db.from("register_sessions")
    .select("id, title, session_date, form").eq("id", sessionId).maybeSingle();
  if (!session) return json({ error: "Unknown session" }, 404);

  return json({
    ok: true,
    form: session.form ?? template,
    source: session.form ? "session" : "template",
    template,
    session: { id: session.id, title: session.title, session_date: session.session_date },
  });
}

async function handleSaveForm(
  db: SupabaseClient, registerId: string, body: Record<string, unknown>,
) {
  const sessionId = cleanText(body.session_id, 64) || null;

  // "Reset to the template" drops this day's own copy rather than overwriting
  // it with a snapshot: null is what makes it inherit future template edits too.
  if (body.reset === true) {
    if (!sessionId) return json({ error: "Only a session can be reset to the template" }, 400);
    const { error } = await db.from("register_sessions")
      .update({ form: null }).eq("id", sessionId);
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true, scope: "template", reset: true, form: await templateForm(db, registerId) });
  }

  const cleaned = cleanForm(body.form);
  if ("error" in cleaned) return json({ error: cleaned.error }, 400);

  // Saving one day's form and adopting it as the template is one action, not
  // two: an organiser who has just got a form right should not have to
  // re-navigate to make it the default.
  const alsoTemplate = body.as_template === true;

  if (sessionId) {
    const { error } = await db.from("register_sessions")
      .update({ form: cleaned.form }).eq("id", sessionId);
    if (error) return json({ error: error.message }, 500);

    if (alsoTemplate) {
      const { error: tplError } = await db.from("register_forms")
        .upsert({ register_id: registerId, form: cleaned.form, updated_at: new Date().toISOString() },
                { onConflict: "register_id" });
      if (tplError) return json({ error: tplError.message }, 500);
    }
    return json({ ok: true, scope: "session", also_template: alsoTemplate, form: cleaned.form });
  }

  const { error } = await db.from("register_forms")
    .upsert({ register_id: registerId, form: cleaned.form, updated_at: new Date().toISOString() },
            { onConflict: "register_id" });
  if (error) return json({ error: error.message }, 500);
  return json({ ok: true, scope: "template", form: cleaned.form });
}

/**
 * Let somebody fill the form in again.
 *
 * Clears the gate, not the response: their previous answers stay in the record
 * and stay anonymous — there is no way to find them to delete, which is the
 * point of the anonymity rule.
 */
async function handleResetFeedback(
  db: SupabaseClient, sessionId: string, body: Record<string, unknown>,
) {
  const attendeeId = cleanText(body.attendee_id, 64);
  if (!attendeeId) return json({ error: "Missing attendee" }, 400);

  const { error } = await db.from("register_attendees")
    .update({ feedback_completed: false })
    .eq("id", attendeeId).eq("session_id", sessionId);

  if (error) return json({ error: error.message }, 500);
  return json({ ok: true });
}

/* -------------------------------------------------------------------- router */

const ANON_ACTIONS = new Set(["check-in", "submit-feedback"]);

// Everything else is a member action. Each names the register it touches, either
// directly (create-session, save-form for a template) or through a session.
const MEMBER_ACTIONS = new Set([
  "create-session", "session-status", "mark-attended",
  "get-form", "save-form", "reset-feedback",
  "email-feedback-link", "chase-absences",
]);

// The subset that names one published teaching day rather than a whole register.
const SESSION_ACTIONS = new Set([
  "session-status", "mark-attended", "reset-feedback", "email-feedback-link",
]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid request body" }, 400);
  }

  const action = String(body.action ?? "");
  const db = service();

  try {
    if (ANON_ACTIONS.has(action)) {
      // No membership check: the session link is the authority, and every write
      // these reach derives its register from that session id.
      return action === "check-in"
        ? await handleCheckIn(db, body)
        : await handleSubmitFeedback(db, body);
    }

    if (!MEMBER_ACTIONS.has(action)) {
      return json({ error: `Unknown action: ${action}` }, 400);
    }

    const user = await signedInUser(req);
    if (!user) return json({ error: "Please sign in to do this" }, 401);

    // Which register does this action touch? A session id decides it wherever
    // there is one, so a caller cannot name a session in register A and a
    // register id in register B and have the looser of the two checked.
    const sessionId = cleanText(body.session_id, 64) || null;
    const registerId = sessionId
      ? await registerOfSession(db, sessionId)
      : cleanText(body.register_id, 64) || null;

    if (!registerId) return json({ error: "Unknown register or session" }, 404);
    if (!await isMember(db, user.id, registerId)) {
      return json({ error: "You do not have access to that register" }, 403);
    }

    // Named separately from the membership check above: these actions all
    // operate on one teaching day, and without a session id they would query
    // against null rather than saying what is missing.
    if (!sessionId && SESSION_ACTIONS.has(action)) {
      return json({ error: "Missing session" }, 400);
    }

    switch (action) {
      case "create-session":  return await handleCreateSession(db, registerId, body);
      case "session-status":  return await handleSessionStatus(db, sessionId!);
      case "mark-attended":   return await handleMarkAttended(db, sessionId!, body);
      case "get-form":        return await handleGetForm(db, registerId, sessionId);
      case "save-form":       return await handleSaveForm(db, registerId, body);
      case "reset-feedback":  return await handleResetFeedback(db, sessionId!, body);
      case "email-feedback-link":
        return await handleEmailFeedbackLink(db, sessionId!, body);
      case "chase-absences":  return await handleChaseAbsences(db, registerId, body);
      default:                return json({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (err) {
    console.error("unhandled error", action, err);
    return json({ error: "Something went wrong" }, 500);
  }
});

// STILL NOT HERE, and deliberately so:
//
//   send-certificate, certificate-preview
//
// Both need pdf-lib (~1MB) server-side. The certificate is instead rendered in
// the browser, where the organiser is already standing, and posted to the
// `register-certificate` function already drawn — see the note at the top of
// that file. Nothing else is outstanding: email-feedback-link and
// chase-absences are above.
