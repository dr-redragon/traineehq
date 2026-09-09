import type { RegisterBlob, RegisterSession, RegisterTrainee } from "./types";
import { sessionsSorted } from "./months";

/**
 * Reading attendance out of the blob.
 *
 * Attendance is a flat map keyed `"<traineeId>|<sessionId>"`. A mark is either
 * `true` — the legacy encoding, from before grade was captured — or an object
 * carrying the grade the trainee gave at check-in. Grade lives on the mark
 * rather than the trainee because it changes between rotations.
 */

export function attendanceKey(traineeId: string, sessionId: string): string {
  return `${traineeId}|${sessionId}`;
}

export function isPresent(blob: RegisterBlob, traineeId: string, sessionId: string): boolean {
  return !!blob.attendance[attendanceKey(traineeId, sessionId)];
}

/** The grade recorded at that check-in, or '' for a legacy mark carrying none. */
export function gradeAt(blob: RegisterBlob, traineeId: string, sessionId: string): string {
  const mark = blob.attendance[attendanceKey(traineeId, sessionId)];
  return mark && typeof mark === "object" && mark.grade ? mark.grade : "";
}

/**
 * The grade to show for a trainee, optionally as at one scope of sessions.
 *
 * The grade held on the trainee record tracks their newest sign-in and is what
 * an organiser edits by hand, so it wins for any view that reaches the present.
 * A past academic year instead reads the grade out of that year's own
 * attendance, falling back to the newest session at or before the end of the
 * scope — so a historical table is never relabelled with a grade the trainee did
 * not hold at the time.
 */
export function latestGrade(
  blob: RegisterBlob,
  traineeId: string,
  scope?: RegisterSession[],
): string {
  const all = sessionsSorted(blob.sessions);

  const trainee = blob.trainees.find((t) => t.id === traineeId);
  const stored = (trainee?.grade ?? "").trim();

  const reachesNow =
    !scope || !all.length || (scope.length > 0 && scope[scope.length - 1].month >= all[all.length - 1].month);

  if (stored && reachesNow) return stored;

  const list = scope ?? all;
  for (let i = list.length - 1; i >= 0; i--) {
    const g = gradeAt(blob, traineeId, list[i].id);
    if (g) return g;
  }

  if (scope && scope.length) {
    const cutoff = scope[scope.length - 1].month;
    for (let i = all.length - 1; i >= 0; i--) {
      if (all[i].month <= cutoff) {
        const g = gradeAt(blob, traineeId, all[i].id);
        if (g) return g;
      }
    }
  }

  return "";
}

/**
 * Re-date every trainee's grade from the newest sign-in that recorded one.
 *
 * A grade is not a property of a person, it is a property of a rotation: the
 * trainee tells us what they are on the sign-in form, and the answer changes
 * every August. So the record on the trainee tracks their most recent sign-in,
 * and `gradeFrom` remembers which teaching day it came from.
 *
 * That date is the whole point. Without it, folding in a batch of sign-ins in
 * any order lets an old one win, and a grade an organiser corrected by hand is
 * undone by the next re-sync of a day that happened two years ago. With it, a
 * grade only ever moves forward: a later month supersedes an earlier one, and a
 * hand-set grade stands until an actual later sign-in disagrees.
 *
 * Pure, like everything else that edits the blob — `useRegisterStore` replays
 * these against a newer blob when a save collides.
 */
export function refreshGrades(blob: RegisterBlob): { blob: RegisterBlob; changed: number } {
  const all = sessionsSorted(blob.sessions);
  let changed = 0;

  const trainees = blob.trainees.map((trainee): RegisterTrainee => {
    let grade = "";
    let month = "";
    for (let i = all.length - 1; i >= 0; i--) {
      const g = gradeAt(blob, trainee.id, all[i].id);
      if (g) { grade = g; month = all[i].month; break; }
    }
    if (!grade) return trainee;

    // Strictly later than the month the held grade was dated from. Equal months
    // change nothing, so re-syncing the same teaching day twice is a no-op.
    if (month <= (trainee.gradeFrom ?? "")) return trainee;
    if (trainee.grade === grade && trainee.gradeFrom === month) return trainee;

    changed++;
    return { ...trainee, grade, gradeFrom: month };
  });

  return { blob: changed ? { ...blob, trainees } : blob, changed };
}
