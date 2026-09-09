/**
 * The multi-register domain.
 *
 * Two unrelated shapes live here:
 *
 *   - the tenancy tables added by 20260907090000_register_multi_tenancy.sql
 *     (who may open which register), and
 *   - `RegisterBlob`, the register's own payload, which is stored whole as JSONB
 *     in `register_stores.data`.
 *
 * The blob shape is carried over verbatim from the standalone register
 * (ent-teaching-register/index.html, the model comment above `let DB`). The rules
 * that read it — eligibility, academic years, reporting — arrive in Stage 3 of
 * docs/REGISTER-INTEGRATION-PLAN.md; this file only says what the data looks like.
 */

export type RegisterRole = "owner" | "editor";

/** Reuses the database's existing `request_status` enum. */
export type RequestStatus = "pending" | "approved" | "rejected";

/**
 * A row from the `register_directory()` function.
 *
 * Deliberately names and counts only — it is readable by anyone signed in,
 * including people with no access to any register, because you cannot ask to
 * join something you cannot see exists.
 */
export interface RegisterDirectoryEntry {
  id: string;
  name: string;
  slug: string;
  deanery_name: string;
  specialty_name: string;
  member_count: number;
  i_am_member: boolean;
  /** Owners administer the register: membership, and its certificate badge. */
  i_am_owner: boolean;
  /** Object path in the register-logos bucket, or null for no badge. */
  certificate_logo_path: string | null;
  /** The status of this user's most recent request, if they have ever made one. */
  my_request: RequestStatus | null;
}

export interface RegisterMember {
  register_id: string;
  user_id: string;
  role: RegisterRole;
  granted_by: string | null;
  granted_at: string;
}

export interface RegisterAccessRequest {
  id: string;
  register_id: string;
  user_id: string;
  reason: string | null;
  status: RequestStatus;
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string | null;
  created_at: string;
}

/** Someone connected to a register: a member, or an applicant to it. */
export interface RegisterPerson {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
}

/** A deanery this user may open a register in. */
export interface CreatableDeanery {
  id: string;
  name: string;
  short_name: string;
}

/** A specialty with no register yet in the chosen deanery. */
export interface CreatableSpecialty {
  id: string;
  name: string;
  short_name: string;
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
}

export interface RegisterSession {
  id: string;
  /** 'YYYY-MM'. The register year runs August to July. */
  month: string;
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
