import type {
  AttendanceMark, RegisterBlob, RegisterExcusal, RegisterSession, RegisterStatus, RegisterTrainee,
} from "./types";
import { EMPTY_REGISTER } from "./types";
import { attendanceKey, gradeAt, isPresent } from "./attendance";
import { academicYearStart, currentAcademicYear, sessionsSorted } from "./months";

/**
 * Immutable edits to the register blob.
 *
 * Every function here takes a blob and returns a new one, touching nothing in
 * place. That is not decoration: `save_register()` refuses a write built on a
 * stale read, so a rejected save has to be replayed against whatever the other
 * person just wrote. Replaying is only sound if the edit is a pure function of
 * the blob it is given — see `useRegisterStore`.
 */

/** Ids in the original register's shape, so old and new rows look alike. */
export function newId(): string {
  return Math.random().toString(36).slice(2, 9);
}

/**
 * Fill in whatever a blob is missing.
 *
 * A register created by `create_register()` starts as `{}`, and blobs written by
 * older versions of the standalone app can be missing keys added later. Every
 * read goes through this so the rest of the code can assume the arrays exist.
 */
export function normaliseBlob(data: Partial<RegisterBlob> | null | undefined): RegisterBlob {
  return {
    trainees:   Array.isArray(data?.trainees)   ? data!.trainees   : [],
    sessions:   Array.isArray(data?.sessions)   ? data!.sessions   : [],
    attendance: data?.attendance && typeof data.attendance === "object" ? data.attendance : {},
    excused:    Array.isArray(data?.excused)    ? data!.excused    : [],
    status:     Array.isArray(data?.status)     ? data!.status     : [],
  };
}

export const emptyBlob = (): RegisterBlob => ({ ...EMPTY_REGISTER, attendance: {} });

// ---------------------------------------------------------------- trainees --

export function upsertTrainee(blob: RegisterBlob, trainee: RegisterTrainee): RegisterBlob {
  const exists = blob.trainees.some((t) => t.id === trainee.id);
  return {
    ...blob,
    trainees: exists
      ? blob.trainees.map((t) => (t.id === trainee.id ? { ...t, ...trainee } : t))
      : [...blob.trainees, trainee],
  };
}

/**
 * Remove a trainee and everything that pointed at them.
 *
 * Attendance, excusals and status rows all key on the trainee id, so leaving
 * them would keep the person in every calculation while removing them from the
 * roster — they would vanish from the table and still move the percentages.
 */
export function removeTrainee(blob: RegisterBlob, traineeId: string): RegisterBlob {
  const attendance: Record<string, AttendanceMark> = {};
  for (const [key, mark] of Object.entries(blob.attendance)) {
    if (key.split("|")[0] !== traineeId) attendance[key] = mark;
  }

  return {
    ...blob,
    trainees: blob.trainees.filter((t) => t.id !== traineeId),
    attendance,
    excused: blob.excused.filter((e) => e.trainee !== traineeId),
    status: blob.status.filter((s) => s.trainee !== traineeId),
  };
}

/**
 * The start month to store for a trainee being added: what was typed, or — left
 * blank — August of this academic year for an ST3, who is new to the programme,
 * and '' (every day counts) for anyone else.
 */
export function startMonthForNew(typed: string, grade: string | undefined, now: Date = new Date()): string {
  if (typed) return typed;
  return (grade ?? "").trim() === "ST3" ? `${currentAcademicYear(now).split("/")[0]}-08` : "";
}

/** Does any trainee still need a start month worked out? */
export function needsStartBackfill(blob: RegisterBlob): boolean {
  return blob.trainees.some((t) => t.startMonth === undefined);
}

/**
 * Give every trainee saved before `startMonth` existed a start month, once.
 *
 * Without one a new ST3 counted as absent for every teaching day ever held, and
 * appeared in — and pulled down — years before they joined. The guess:
 *
 *   - their first sign-in with a grade was as ST3 → they started that academic
 *     year (ST3 is the programme's first year), or with their first sign-in of
 *     any kind if that came earlier;
 *   - no sign-ins at all and held as ST3 → they start this academic year, unless
 *     something else on record (an excusal, a leave or status entry) predates it.
 *     That is an existing ST3 who missed everything — on leave all year, say —
 *     and they are left counting for every day;
 *   - anyone else → '' (every day counts, as before).
 *
 * The answer is stored, so it is worked out only once and an organiser's edit
 * sticks. `now` is fixed by the caller so a replayed edit gives the same answer.
 */
export function backfillStartMonths(blob: RegisterBlob, now: Date = new Date()): RegisterBlob {
  if (!needsStartBackfill(blob)) return blob;

  const all = sessionsSorted(blob.sessions);
  const thisYear = `${currentAcademicYear(now).split("/")[0]}-08`;
  const yearStart = (month: string) => `${academicYearStart(month)}-08`;
  const monthOf = new Map(blob.sessions.map((s) => [s.id, s.month]));

  const trainees = blob.trainees.map((t) => {
    if (t.startMonth !== undefined) return t;
    let start = "";
    const attended = all.filter((s) => isPresent(blob, t.id, s.id));
    const firstGraded = attended.find((s) => gradeAt(blob, t.id, s.id));

    if (firstGraded && gradeAt(blob, t.id, firstGraded.id) === "ST3") {
      start = yearStart(firstGraded.month);
      if (attended[0].month < start) start = yearStart(attended[0].month);
    } else if (!attended.length && (t.grade ?? "").trim() === "ST3") {
      const earlierExcusal = blob.excused.some((e) => {
        const m = e.trainee === t.id ? monthOf.get(e.session) : undefined;
        return !!m && m < thisYear;
      });
      const earlierStatus = blob.status.some((st) =>
        st.trainee === t.id && ((!!st.start && st.start < thisYear) || (!!st.end && st.end < thisYear)));
      if (!earlierExcusal && !earlierStatus) start = thisYear;
    }
    return { ...t, startMonth: start };
  });

  return { ...blob, trainees };
}

// ---------------------------------------------------------------- sessions --

export function upsertSession(blob: RegisterBlob, session: RegisterSession): RegisterBlob {
  const exists = blob.sessions.some((s) => s.id === session.id);
  return {
    ...blob,
    sessions: exists
      ? blob.sessions.map((s) => (s.id === session.id ? { ...s, ...session } : s))
      : [...blob.sessions, session],
  };
}

/** Remove a teaching day, and the attendance and excusals recorded against it. */
export function removeSession(blob: RegisterBlob, sessionId: string): RegisterBlob {
  const attendance: Record<string, AttendanceMark> = {};
  for (const [key, mark] of Object.entries(blob.attendance)) {
    if (key.split("|")[1] !== sessionId) attendance[key] = mark;
  }

  return {
    ...blob,
    sessions: blob.sessions.filter((s) => s.id !== sessionId),
    attendance,
    excused: blob.excused.filter((e) => e.session !== sessionId),
  };
}

// -------------------------------------------------------------- attendance --

export function setAttendance(
  blob: RegisterBlob,
  traineeId: string,
  sessionId: string,
  present: boolean,
  grade?: string,
): RegisterBlob {
  const key = attendanceKey(traineeId, sessionId);
  const attendance = { ...blob.attendance };

  if (present) {
    // Keep the grade already recorded at check-in unless a new one is given —
    // an organiser correcting a tick should not silently erase what the trainee
    // told the sign-in form.
    const existing = blob.attendance[key];
    const kept = existing && typeof existing === "object" ? existing.grade : undefined;
    attendance[key] = { grade: grade ?? kept ?? "" };
  } else {
    delete attendance[key];
  }

  return { ...blob, attendance };
}

export function toggleAttendance(
  blob: RegisterBlob,
  traineeId: string,
  sessionId: string,
): RegisterBlob {
  const present = !!blob.attendance[attendanceKey(traineeId, sessionId)];
  return setAttendance(blob, traineeId, sessionId, !present);
}

// ----------------------------------------------------------------- excused --

/**
 * Excuse a trainee from one teaching day.
 *
 * Marking someone excused clears any attendance mark: they cannot be both
 * present and excused, and of the two, the one just chosen wins.
 */
export function addExcusal(
  blob: RegisterBlob,
  traineeId: string,
  sessionId: string,
  reason: string,
): RegisterBlob {
  const already = blob.excused.some((e) => e.trainee === traineeId && e.session === sessionId);
  const cleared = setAttendance(blob, traineeId, sessionId, false);
  if (already) return cleared;

  return {
    ...cleared,
    excused: [
      ...cleared.excused,
      {
        id: newId(),
        trainee: traineeId,
        session: sessionId,
        reason: reason.trim(),
        ts: String(Date.now()),
      } satisfies RegisterExcusal,
    ],
  };
}

export function removeExcusal(blob: RegisterBlob, excusalId: string): RegisterBlob {
  return { ...blob, excused: blob.excused.filter((e) => e.id !== excusalId) };
}

// ------------------------------------------------------------------ status --

export function upsertStatus(blob: RegisterBlob, status: RegisterStatus): RegisterBlob {
  const exists = blob.status.some((s) => s.id === status.id);
  return {
    ...blob,
    status: exists
      ? blob.status.map((s) => (s.id === status.id ? { ...s, ...status } : s))
      : [...blob.status, status],
  };
}

export function removeStatus(blob: RegisterBlob, statusId: string): RegisterBlob {
  return { ...blob, status: blob.status.filter((s) => s.id !== statusId) };
}
