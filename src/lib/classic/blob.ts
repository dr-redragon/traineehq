import type {
  AttendanceMark, RegisterBlob, RegisterExcusal, RegisterSession, RegisterStatus, RegisterTrainee,
} from "./types";
import { EMPTY_REGISTER } from "./types";
import { attendanceKey } from "./attendance";

/**
 * Immutable edits to the register blob.
 *
 * Every function here takes a blob and returns a new one, touching nothing in
 * place. That is not decoration: `save_classic_register()` refuses a write built on a
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
 * A register created by `create_classic_register()` starts as `{}`, and blobs written by
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
