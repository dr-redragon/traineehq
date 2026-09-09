import { supabase } from "@/integrations/supabase/client";
import type {
  CertificateOutcome, FeedbackForm, FeedbackResponse, LiveSession, PublicRoster,
  PublicSession, SendOutcome, SessionStatus,
} from "./types";

/**
 * The live teaching day: publishing it, signing in to it, and reading it back.
 *
 * Everything that writes goes through the `register-api` edge function, because
 * no browser role holds insert, update or delete on any of these tables. The two
 * anonymous calls carry no credential beyond the session id in the link — that
 * is the whole of a trainee's authority, and the function derives the register
 * from it rather than trusting a caller to name one.
 */

async function callApi<T>(action: string, body: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke("register-api", {
    body: { action, ...body },
  });

  if (error) {
    // A non-2xx from the function arrives as a FunctionsHttpError whose body
    // holds the message we actually wrote; surface that rather than
    // "Edge Function returned a non-2xx status code".
    const withContext = error as { context?: Response };
    if (withContext.context && typeof withContext.context.json === "function") {
      const parsed = await withContext.context.json().catch(() => null) as { error?: string } | null;
      if (parsed?.error) throw new Error(parsed.error);
    }
    throw new Error(error.message);
  }

  const result = data as { error?: string } & T;
  if (result?.error) throw new Error(result.error);
  return result;
}

const untyped = supabase as unknown as {
  rpc: (fn: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
  from: (table: string) => {
    select(columns?: string): {
      eq(column: string, value: unknown): {
        order(column: string, options?: { ascending?: boolean }): PromiseLike<{ data: unknown; error: { message: string } | null }>;
      } & PromiseLike<{ data: unknown; error: { message: string } | null }>;
    };
  };
};

// ------------------------------------------------------------------ anonymous

/** One session, by the id in the link. Returns null for a link that has expired. */
export async function fetchPublicSession(sessionId: string): Promise<PublicSession | null> {
  const { data, error } = await untyped.rpc("register_public_session", { _session_id: sessionId });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as PublicSession[];
  return rows[0] ?? null;
}

/** The names behind the sign-in dropdown, for that session's register. */
export async function fetchPublicRoster(sessionId: string): Promise<PublicRoster> {
  const { data, error } = await untyped.rpc("register_public_roster", { _session_id: sessionId });
  if (error) throw new Error(error.message);
  return (data as PublicRoster) ?? { trainees: [], sessions: [] };
}

export async function checkIn(args: {
  sessionId: string;
  name: string;
  email: string;
  grade?: string;
  localTraineeId?: string | null;
}): Promise<{ enrolled: boolean; attendee: { id: string; name: string } }> {
  return callApi("check-in", {
    session_id: args.sessionId,
    name: args.name,
    email: args.email,
    grade: args.grade ?? null,
    local_trainee_id: args.localTraineeId ?? null,
  });
}

export async function submitFeedback(args: {
  sessionId: string;
  identifier: string;
  overallRating: number;
  answers: Record<string, unknown>;
  comments?: string;
}): Promise<{
  status: "recorded" | "already_submitted";
  matched?: boolean;
  /** What became of the certificate the feedback was exchanged for. */
  certificate?: CertificateOutcome;
}> {
  return callApi("submit-feedback", {
    session_id: args.sessionId,
    identifier: args.identifier,
    overall_rating: args.overallRating,
    answers: args.answers,
    comments: args.comments ?? "",
  });
}

// --------------------------------------------------------------------- member

/** Publish a teaching day for check-in, or update the one already published. */
export async function publishSession(args: {
  registerId: string;
  title: string;
  sessionDate: string;
  location?: string | null;
  localId?: string | null;
}): Promise<{ session: LiveSession; created: boolean }> {
  return callApi("create-session", {
    register_id: args.registerId,
    title: args.title,
    session_date: args.sessionDate,
    location: args.location ?? null,
    local_id: args.localId ?? null,
  });
}

export async function fetchSessionStatus(sessionId: string): Promise<SessionStatus> {
  return callApi("session-status", { session_id: sessionId });
}

export async function markAttended(args: {
  sessionId: string;
  trainees: { name: string; local_trainee_id?: string | null; grade?: string | null; email?: string | null }[];
  checkedIn?: boolean;
}): Promise<{ marked: number; no_email: string[] }> {
  return callApi("mark-attended", {
    session_id: args.sessionId,
    trainees: args.trainees,
    checked_in: args.checkedIn !== false,
  });
}

export async function getForm(args: { registerId: string; sessionId?: string | null }): Promise<{
  form: FeedbackForm; source: "session" | "template"; template: FeedbackForm;
}> {
  return callApi("get-form", {
    register_id: args.registerId,
    session_id: args.sessionId ?? null,
  });
}

export async function saveForm(args: {
  registerId: string;
  sessionId?: string | null;
  form: FeedbackForm;
  /** Save this day's form and adopt it as the register's template in one go. */
  alsoTemplate?: boolean;
}): Promise<{ scope: "session" | "template"; also_template?: boolean; form: FeedbackForm }> {
  return callApi("save-form", {
    register_id: args.registerId,
    session_id: args.sessionId ?? null,
    form: args.form,
    as_template: args.alsoTemplate === true,
  });
}

/**
 * Drop one teaching day's own form so it follows the template again.
 *
 * Not "copy the template onto it": the day's form is set back to null, so later
 * template edits reach it too.
 */
export async function resetFormToTemplate(args: {
  registerId: string; sessionId: string;
}): Promise<{ form: FeedbackForm }> {
  return callApi("save-form", {
    register_id: args.registerId, session_id: args.sessionId, reset: true,
  });
}

/**
 * Email the anonymous feedback link to people who signed in and have not
 * answered. `attendeeIds` narrows it to a chosen few; omitted, it goes to
 * everyone outstanding.
 */
export async function emailFeedbackLink(args: {
  sessionId: string; attendeeIds?: string[] | null;
}): Promise<SendOutcome> {
  return callApi("email-feedback-link", {
    session_id: args.sessionId,
    ...(args.attendeeIds?.length ? { attendee_ids: args.attendeeIds } : {}),
  });
}

/**
 * Ask a group of trainees why they were not at a teaching day.
 *
 * Who counts as unexplained is decided in the browser — eligibility, excusals
 * and long-term status live in the register blob and nowhere else — so only the
 * addresses travel. The function checks them against the roster before sending.
 */
export async function chaseAbsences(args: {
  sessionId: string;
  recipients: string[];
  subject: string;
  body: string;
  replyTo?: string[];
}): Promise<SendOutcome> {
  return callApi("chase-absences", {
    session_id: args.sessionId,
    recipients: args.recipients,
    subject: args.subject,
    body: args.body,
    reply_to: args.replyTo ?? [],
  });
}

export async function resetFeedback(sessionId: string, attendeeId: string): Promise<void> {
  await callApi("reset-feedback", { session_id: sessionId, attendee_id: attendeeId });
}

/**
 * Delete every response for one teaching day and reopen the form.
 *
 * The only way to remove an individual answer, precisely because nothing links
 * one to a person — so a test run, or a form that asked the wrong question, can
 * only be undone wholesale. Certificates already issued are left alone.
 */
export async function deleteAllFeedback(sessionId: string): Promise<{ deleted: number }> {
  return callApi("reset-feedback", { session_id: sessionId, confirm: true });
}

/**
 * Issue one certificate now.
 *
 * `force` is the organiser overruling the feedback gate — somebody who gave
 * their feedback on paper, or a certificate that has to be sent again.
 */
export async function sendCertificate(args: {
  sessionId: string; attendeeId: string; force?: boolean;
}): Promise<{ certificate: CertificateOutcome }> {
  return callApi("send-certificate", {
    session_id: args.sessionId,
    attendee_id: args.attendeeId,
    force: args.force === true,
  });
}

/** Draw a certificate without sending it, so the design can be checked. */
export async function previewCertificate(args: {
  registerId: string; sessionId?: string | null; name?: string;
}): Promise<{ pdf_base64: string }> {
  return callApi("certificate-preview", {
    register_id: args.registerId,
    session_id: args.sessionId ?? null,
    name: args.name ?? "",
  });
}

// ------------------------------------------------------------------- read-back

/** The published teaching days for a register. Members read these directly. */
export async function fetchLiveSessions(registerId: string): Promise<LiveSession[]> {
  const { data, error } = await untyped
    .from("register_sessions")
    .select("id, register_id, title, session_date, location, local_id, form")
    .eq("register_id", registerId)
    .order("session_date", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as LiveSession[];
}

/**
 * Feedback for one teaching day.
 *
 * Anonymous by construction: these rows carry no identifier and no foreign key
 * to an attendee. Reading them tells a member what was said, never by whom.
 */
export async function fetchFeedback(sessionId: string): Promise<FeedbackResponse[]> {
  const { data, error } = await untyped
    .from("register_feedback")
    .select("id, session_id, overall_rating, answers, comments, submitted_at")
    .eq("session_id", sessionId)
    .order("submitted_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as FeedbackResponse[];
}
