/**
 * The register domain.
 *
 * Two unrelated shapes live here:
 *
 *   - the tenancy tables (who may open which register, and on what plan), and
 *   - `RegisterBlob`, the register's own payload, which is stored whole as JSONB
 *     in `register_stores.data`.
 */

/**
 * owner   everything, including who else has access
 * editor  read and write
 * viewer  read only
 */
export type RegisterRole = "owner" | "editor" | "viewer";

/**
 * `event` is free and covers one event — a conference, a course — of a few
 * days. `regular` runs through the year and needs its owner to be subscribed.
 */
export type RegisterKind = "regular" | "event";

/** A row from `register_directory()`: one register this person belongs to. */
export interface RegisterDirectoryEntry {
  id: string;
  name: string;
  slug: string;
  /** Who runs it. Printed above the name on certificates. */
  organisation: string | null;
  kind: RegisterKind;
  member_count: number;
  i_am_member: boolean;
  /** Owners administer the register: membership, and its certificate badge. */
  i_am_owner: boolean;
  my_role: RegisterRole;
  /** Object path in the register-logos bucket, or null for no badge. */
  certificate_logo_path: string | null;
  /** Template, colour and wording of this register's certificates. */
  certificate_design: Record<string, unknown> | null;
  /**
   * False for a regular register none of whose owners is subscribed. It can
   * still be read, exported and deleted; nothing can be written to it.
   */
  entitled: boolean;
  created_at: string;
}

export interface RegisterMember {
  register_id: string;
  user_id: string;
  role: RegisterRole;
  granted_by: string | null;
  granted_at: string;
}

/** An invitation an owner has sent. Only owners can read these. */
export interface RegisterInvite {
  id: string;
  register_id: string;
  email: string;
  role: RegisterRole;
  token: string;
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
}

/** What somebody holding an invitation link is shown before accepting. */
export interface InvitePreview {
  register_name: string;
  organisation: string | null;
  kind: RegisterKind;
  role: RegisterRole;
  invited_by: string | null;
  usable: boolean;
  /** An owner invitation, opened by an account other than the one invited. */
  wrong_account: boolean;
  already_member: boolean;
  slug: string | null;
}

/** A member of a register, as its other members see them. */
export interface RegisterPerson {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
}

/** `my_plan()`: what this account is paying for, if anything. */
export interface Plan {
  subscribed: boolean;
  /** Stripe's own status, 'comp' for a plan given by hand, or 'none'. */
  status: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  managed_by_stripe: boolean;
  /** The longest an event register may run, in days. */
  event_max_days: number;
}

// ---------------------------------------------------------------------------
// The register payload
// ---------------------------------------------------------------------------

export interface RegisterTrainee {
  id: string;
  name: string;
  /** Set by hand for someone who has not signed in yet; otherwise self-reported. */
  grade?: string;
  /** Where certificates are sent. Absent until the trainee supplies one. */
  email?: string;
  /**
   * 'YYYY-MM' — the month they joined the programme, or '' / absent for someone
   * who counts for every teaching day. Days before it are not theirs at all:
   * they count neither for nor against them, and any academic year that ends
   * before it leaves them out entirely. See `startedBy` and `backfillStartMonths`.
   */
  startMonth?: string;
}

export interface RegisterSession {
  id: string;
  /**
   * 'YYYY-MM'. The register year runs August to July. Every rule about who was
   * eligible reads this; for a dated day it is always the month of `date`.
   */
  month: string;
  /**
   * 'YYYY-MM-DD', the day it actually happened. Several teaching days can share
   * a month, so this is what tells them apart. Absent on days recorded before
   * dates were kept, which show as their month alone.
   */
  date?: string;
  /** Where it was held, if anyone said. Printed on the certificate. */
  location?: string;
  title: string;
  /** The matching `sessions` row, once the day has been published for check-in. */
  cloudId?: string;
}

/**
 * Attendance is keyed `"<traineeId>|<sessionId>"`.
 *
 * `true` is the legacy encoding for "present, grade unknown" — grade began being
 * captured per check-in later, because it changes between rotations.
 */
export type AttendanceMark = true | { grade?: string };

export interface RegisterExcusal {
  id: string;
  trainee: string;
  session: string;
  reason: string;
  ts: string;
}

/**
 * A trainee's programme status over a window of months.
 *
 * `start` and `end` are 'YYYY-MM' or null, and which of them matters depends on
 * `type` — see the eligibility rules ported in Stage 3.
 */
export interface RegisterStatus {
  id: string;
  trainee: string;
  type: "active" | "cct" | "idt_in" | "idt_out" | "mat" | "oop";
  start: string | null;
  end: string | null;
}

export interface RegisterBlob {
  trainees: RegisterTrainee[];
  sessions: RegisterSession[];
  attendance: Record<string, AttendanceMark>;
  excused: RegisterExcusal[];
  status: RegisterStatus[];
  /** The register's own lists. Absent means the defaults in constants.ts. */
  settings?: RegisterSettings;
}

/**
 * What a register's organisers have changed from the defaults. Each list is
 * absent until somebody edits it, so a register that never does keeps
 * following the defaults if they are improved.
 */
export interface RegisterSettings {
  /** The reasons offered when excusing an absence. "Other" is always added. */
  excusalReasons?: string[];
  /** The grades or roles offered on the sign-in form and the roster. */
  grades?: string[];
}

export const EMPTY_REGISTER: RegisterBlob = {
  trainees: [],
  sessions: [],
  attendance: {},
  excused: [],
  status: [],
};

/** One `register_stores` row: the blob plus the guard that serialises writes. */
export interface RegisterStore {
  register_id: string;
  data: RegisterBlob;
  version: number;
  updated_at: string;
  updated_by: string | null;
}

// ---------------------------------------------------------------------------
// The live teaching day
// ---------------------------------------------------------------------------

/** What an anonymous visitor holding a check-in link is allowed to know. */
export interface PublicSession {
  id: string;
  title: string;
  session_date: string;
  location: string | null;
  local_id: string | null;
  form: FeedbackForm | null;
}

/** A name for the sign-in dropdown. Never an address — only whether we hold one. */
export interface RosterEntry {
  id: string;
  name: string;
  has_email: boolean;
}

export interface PublicRoster {
  trainees: RosterEntry[];
  sessions: { id: string; month: string; title: string }[];
  /** The register's own grade list, or null for the defaults. */
  grades?: string[] | null;
}

export interface RegisterAttendee {
  id: string;
  name: string;
  email: string;
  grade: string | null;
  checked_in_at: string | null;
  feedback_completed: boolean;
  certificate_sent_at: string | null;
}

/**
 * What `session-status` returns.
 *
 * The three `email_*` fields say whether mail can leave at all, before an
 * organiser presses a button and is told a send "succeeded" to nobody.
 */
export interface SessionStatus {
  session: LiveSession;
  attendees: RegisterAttendee[];
  feedback_count: number;
  email_configured: boolean;
  email_sandbox: boolean;
  email_from: string;
}

/** The outcome of one bulk send: who got it, and by name who did not. */
export interface SendOutcome {
  sent: number;
  considered: number;
  failures: { name?: string; email?: string; why: string; batch?: number }[];
  sandbox: boolean;
  from: string;
  /** Chaser only: addresses dropped because they are not on the roster. */
  not_on_roster?: number;
}

export interface LiveSession {
  id: string;
  register_id: string;
  title: string;
  session_date: string;
  location: string | null;
  local_id: string | null;
  form: FeedbackForm | null;
}

export type QuestionType = "scale" | "short" | "long" | "choice" | "checkbox";

export interface FeedbackQuestion {
  id: string;
  type: QuestionType;
  text: string;
  required: boolean;
  options?: string[];
  lowLabel?: string;
  highLabel?: string;
  placeholder?: string;
  /** The overall rating cannot be removed — the report is built on it. */
  locked?: boolean;
}

export interface FeedbackForm {
  title: string;
  questions: FeedbackQuestion[];
}

export interface FeedbackResponse {
  id: string;
  session_id: string;
  overall_rating: number | null;
  answers: Record<string, unknown>;
  comments: string | null;
  submitted_at: string;
}

/**
 * A row from `register_archive()` — a register that has been deleted but not
 * yet destroyed. `purge_at` is the database's own deadline, so the countdown an
 * organiser sees and the rule that refuses a late restore are the same date.
 */
export interface ArchivedRegister {
  id: string;
  name: string;
  slug: string;
  organisation: string | null;
  kind: RegisterKind;
  archived_at: string;
  purge_at: string;
  /** What is in it, so the row is a decision rather than a filename. */
  trainee_count: number;
  session_count: number;
}
