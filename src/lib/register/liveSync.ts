import { attendanceKey, gradeAt, isPresent, refreshGrades } from "./attendance";
import { newId } from "./blob";
import type { AttendanceMark, RegisterAttendee, RegisterBlob, RegisterTrainee } from "./types";

/**
 * Keeping the attendance grid and the live teaching day saying the same thing.
 *
 * The two halves are recorded in different places and neither is a copy of the
 * other. A trainee who scans the QR writes an attendee row in Supabase, and
 * `register_record_checkin()` writes the matching mark into the blob. An
 * organiser ticking a cell in the grid writes only the blob — and until that
 * reaches Supabase, that person is invisible to the live day: not on the
 * feedback form's list, never sent a link, never issued a certificate.
 *
 * That is the whole of the bug this module exists to close. Publishing a
 * teaching day that already has attendance recorded is the case where it bites
 * hardest: every tick made before the day went live is missing from the moment
 * the QR appears.
 *
 * Everything here is a pure function of the blob it is given, because
 * `useRegisterStore` replays edits against a newer blob when a save collides.
 */

/** A trainee the register holds no address for, as the edge function marks them. */
const NO_EMAIL_DOMAIN = "@no-email.invalid";
export const isPlaceholderEmail = (email: string | null | undefined) =>
  (email ?? "").toLowerCase().endsWith(NO_EMAIL_DOMAIN);

const nameKey = (name: string) => name.trim().toLowerCase();

export interface AttendedPayload {
  name: string;
  local_trainee_id: string | null;
  grade: string | null;
  email: string | null;
}

/** One trainee, in the shape `mark-attended` takes. */
export function attendedPayload(
  blob: RegisterBlob, traineeId: string, localSessionId: string,
): AttendedPayload | null {
  const trainee = blob.trainees.find((t) => t.id === traineeId);
  if (!trainee) return null;
  return {
    name: trainee.name,
    local_trainee_id: trainee.id,
    // The grade recorded at this check-in, not today's — a certificate for a
    // day two years ago should say what they were then.
    grade: gradeAt(blob, trainee.id, localSessionId) || trainee.grade || null,
    email: (trainee.email ?? "").trim() || null,
  };
}

/**
 * Everyone the register already has down as present for a teaching day.
 *
 * This is what gets pushed when a day is published or re-synced, and it is why
 * publishing a past teaching day now produces a live list that matches the grid
 * instead of an empty one.
 */
export function presentPayloads(blob: RegisterBlob, localSessionId: string): AttendedPayload[] {
  return blob.trainees
    .filter((t) => isPresent(blob, t.id, localSessionId))
    .map((t) => attendedPayload(blob, t.id, localSessionId))
    .filter((p): p is AttendedPayload => p !== null);
}

export interface MergeResult {
  blob: RegisterBlob;
  /** Sign-ins that were not in the grid and now are. */
  added: number;
  /** Marks whose recorded grade the trainee corrected on the day. */
  regraded: number;
  /** Roster records that gained an address from what somebody typed. */
  emailed: number;
  /** People who signed in under a name the roster did not hold. */
  enrolled: string[];
  /** Trainees whose held grade this moved on to a later teaching day's. */
  regraded_records: number;
}

/**
 * Fold a published day's sign-ins back into the register.
 *
 * Matching is by name, which is what the standalone register did and what the
 * sign-in page's own dropdown makes true for everybody who picks their name off
 * it. Anyone who typed a name instead — "my name is not on the list" — joins the
 * roster here rather than being reported and forgotten: this day counts for
 * them, and they are listed for every teaching day after it.
 */
export function mergeCheckIns(
  blob: RegisterBlob,
  localSessionId: string,
  attendees: RegisterAttendee[],
): MergeResult {
  const trainees = [...blob.trainees];
  const attendance: Record<string, AttendanceMark> = { ...blob.attendance };
  const byName = new Map(trainees.map((t, i) => [nameKey(t.name), i]));

  let added = 0;
  let regraded = 0;
  let emailed = 0;
  const enrolled: string[] = [];

  for (const attendee of attendees) {
    if (!attendee.checked_in_at) continue;
    const name = (attendee.name ?? "").trim();
    if (!name) continue;

    let index = byName.get(nameKey(name));
    if (index === undefined) {
      const fresh: RegisterTrainee = { id: newId(), name, grade: attendee.grade ?? "" };
      index = trainees.push(fresh) - 1;
      byName.set(nameKey(name), index);
      enrolled.push(name);
    }

    const trainee = trainees[index];
    const key = attendanceKey(trainee.id, localSessionId);
    const existing = attendance[key];

    if (!existing) {
      attendance[key] = { grade: attendee.grade ?? "" };
      added++;
    } else if (attendee.grade) {
      // What they put on the form is the trainee's own statement of their grade,
      // so a corrected re-sign-in replaces what we held rather than being lost.
      const held = typeof existing === "object" ? existing.grade ?? "" : "";
      if (held !== attendee.grade) {
        attendance[key] = { grade: attendee.grade };
        regraded++;
      }
    }

    // Backfill a missing roster address from what they signed in with. The
    // placeholder the server invents for somebody with no address on file is
    // undeliverable, and writing it back would look like an email.
    if (
      attendee.email && !isPlaceholderEmail(attendee.email) && !(trainee.email ?? "").trim()
    ) {
      trainees[index] = { ...trainee, email: attendee.email };
      emailed++;
    } else if (!trainees[index].grade && attendee.grade) {
      trainees[index] = { ...trainees[index], grade: attendee.grade };
    }
  }

  // A sign-in is where a grade comes from, so folding sign-ins in re-dates the
  // grades held on the roster — see `refreshGrades`. Doing it here rather than
  // at the call site is what makes "Re-sync sign-ins" leave the register in the
  // state it would have been in had every sign-in arrived live.
  const dated = refreshGrades({ ...blob, trainees, attendance });

  return {
    blob: dated.blob,
    added, regraded, emailed, enrolled,
    regraded_records: dated.changed,
  };
}

/** One sentence saying what a re-sync actually did, or that it found nothing. */
export function describeSync(result: MergeResult, pushed: number): string {
  const parts: string[] = [];
  if (result.added) {
    parts.push(`${result.added} sign-in${result.added === 1 ? "" : "s"} added to the register.`);
  }
  if (pushed) {
    parts.push(
      `${pushed} marked present here ${pushed === 1 ? "is" : "are"} now on the live list too.`,
    );
  }
  if (result.regraded || result.regraded_records) {
    const n = Math.max(result.regraded, result.regraded_records);
    parts.push(`${n} grade${n === 1 ? "" : "s"} brought up to date.`);
  }
  if (result.emailed) {
    parts.push(`${result.emailed} email${result.emailed === 1 ? "" : "s"} added to the roster.`);
  }
  if (result.enrolled.length) {
    parts.push(
      `Added to the roster: ${result.enrolled.join(", ")}.`,
    );
  }
  return parts.length ? parts.join(" ") : "Everything already matched — nothing to change.";
}
