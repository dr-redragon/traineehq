import { isEligible, isExcused } from "./eligibility";
import { isPresent } from "./attendance";
import { formatMonth } from "./months";
import type { RegisterBlob, RegisterSession, RegisterTrainee } from "./types";

/**
 * Unexplained absence: who the register shows as away from a teaching day with
 * no reason recorded, and the chaser email that asks them why.
 *
 * All of it is worked out here rather than on the server, because eligibility,
 * excusals and long-term status live in the register blob and in no table the
 * edge function can read. Only the addresses are ever sent.
 */

/**
 * Eligible for this teaching day, not marked present, and not excused.
 *
 * Anyone whose programme window does not cover the month — pre-start, on leave,
 * post-CCT, transferred out — falls out through `isEligible`, so nobody is asked
 * to explain missing a day that was never theirs to attend.
 */
export function unexplainedAbsentees(
  blob: RegisterBlob,
  session: RegisterSession | undefined,
): RegisterTrainee[] {
  if (!session) return [];
  return blob.trainees
    .filter((t) => isEligible(blob, t.id, session.month))
    .filter((t) => !isPresent(blob, t.id, session.id))
    .filter((t) => !isExcused(blob, t.id, session.id))
    .sort((a, b) => a.name.localeCompare(b.name));
}

const hasEmail = (t: RegisterTrainee) => !!(t.email ?? "").trim();

/** The absentees split by whether there is anywhere to send the email. */
export function splitByEmail(absent: RegisterTrainee[]) {
  return {
    withEmail: absent.filter(hasEmail),
    withoutEmail: absent.filter((t) => !hasEmail(t)),
  };
}

export function defaultChaseSubject(session: RegisterSession): string {
  return `Attendance query — ${session.title} (${formatMonth(session.month, "en-GB")})`;
}

/**
 * The opening draft, which the organiser is expected to edit.
 *
 * Written as a question rather than an accusation on purpose: the register is
 * often what is wrong, and the second paragraph says so — a trainee who was
 * there needs an easy way to say it.
 */
export function defaultChaseBody(session: RegisterSession, registerName?: string): string {
  return [
    "Hello,",
    `Our records show you were not at ${session.title} on ` +
      `${formatMonth(session.month, "en-GB")}. Please could you reply with the reason, so we can ` +
      "update the register?",
    "If you were there and we have missed you, just say so and we will correct it.",
    `Many thanks,\n${registerName ?? "The teaching programme"}`,
  ].join("\n\n");
}

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
