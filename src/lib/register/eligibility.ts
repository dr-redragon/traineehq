import type { RegisterBlob, RegisterSession, RegisterStatus } from "./types";
import { currentMonth } from "./months";
import { isPresent } from "./attendance";

/**
 * Who counts, for which teaching day.
 *
 * A trainee is eligible by default; a long-term status row can switch that off
 * for a range of months. Sessions outside a trainee's active window are marked
 * "not eligible" and drop out of both numerator and denominator, so time spent
 * on leave or after CCT does not read as poor attendance.
 *
 * Months are 'YYYY-MM' strings throughout, which compare correctly as text.
 */

export type CellState = "present" | "excused" | "absent" | "na";

export function statusFor(blob: RegisterBlob, traineeId: string): RegisterStatus[] {
  return blob.status.filter((s) => s.trainee === traineeId);
}

/**
 * Is this trainee expected at a session in this month?
 *
 * Each status type reads its window differently, and each tolerates a missing
 * bound because organisers often know one date and not the other:
 *
 *   active   always eligible; the baseline, and a no-op
 *   cct      training ends — ineligible after the CCT month
 *   idt_out  transfers out — ineligible from the transfer month onward
 *   idt_in   arrives — ineligible before the arrival month
 *   mat/oop  a leave window; an absent bound leaves that side open
 *
 * `cct` falls back to `start` when `end` is missing, while the two IDT types
 * fall back the other way — a departure is recorded by when it ends, an arrival
 * or transfer by when it happens.
 */
export function isEligible(blob: RegisterBlob, traineeId: string, month: string): boolean {
  for (const st of statusFor(blob, traineeId)) {
    if (st.type === "active") continue;

    if (st.type === "cct") {
      const m = st.end || st.start;
      if (m && month > m) return false;
    } else if (st.type === "idt_out") {
      const m = st.start || st.end;
      if (m && month >= m) return false;
    } else if (st.type === "idt_in") {
      const m = st.start || st.end;
      if (m && month < m) return false;
    } else if (st.type === "mat" || st.type === "oop") {
      // A window open on whichever side has no bound. With neither, the leave is
      // treated as ongoing from the beginning of the register.
      const afterStart = st.start ? month >= st.start : true;
      const beforeEnd = st.end ? month <= st.end : true;
      if (afterStart && beforeEnd) return false;
    }
  }
  return true;
}

/**
 * Has this trainee been excused from this session?
 *
 * Matched on the session itself. The original register matched on the session's
 * *month* instead, so where a month held two teaching days, excusing one excused
 * both — the only intentional behaviour change made during the port, and the one
 * divergence `parity.test.ts` records rather than enforces.
 *
 * Existing data needs no migration: an excusal has always been stored against a
 * session id, and this simply stops widening it to the month. Registers with the
 * usual one teaching day a month are unaffected either way.
 */
export function isExcused(blob: RegisterBlob, traineeId: string, sessionId: string): boolean {
  return blob.excused.some((e) => e.trainee === traineeId && e.session === sessionId);
}

/** How one trainee/session cell reads. Ineligibility outranks everything else. */
export function cellState(
  blob: RegisterBlob,
  traineeId: string,
  session: RegisterSession,
): CellState {
  if (!isEligible(blob, traineeId, session.month)) return "na";
  if (isPresent(blob, traineeId, session.id)) return "present";
  if (isExcused(blob, traineeId, session.id)) return "excused";
  return "absent";
}

/**
 * What a trainee's long-term status *is* at a given month, as opposed to what
 * has ever been recorded for them.
 *
 * Leave expires by itself: once a mat/oop window's end month is behind the
 * reference month, the trainee is active again with nothing to click. CCT and
 * IDT-out are one-way departures and IDT-in a one-way arrival, so those keep
 * showing whatever the date.
 *
 * The status row is never modified on expiry — it stays as the record of when
 * the leave was, which is the memory the register exists to keep. Only this
 * derived, point-in-time answer changes.
 */
export function activeStatusType(
  blob: RegisterBlob,
  traineeId: string,
  atMonth?: string,
): RegisterStatus | null {
  const rows = statusFor(blob, traineeId).filter((s) => s.type !== "active");
  if (!rows.length) return null;

  const cutoff = atMonth || currentMonth();

  for (const st of rows) {
    if ((st.type === "mat" || st.type === "oop") && st.end && st.end < cutoff) continue;
    return st;
  }
  return null;
}

/** On maternity/paternity or out-of-programme leave as at `atMonth`. */
export function isOnLeave(blob: RegisterBlob, traineeId: string, atMonth?: string): boolean {
  const st = activeStatusType(blob, traineeId, atMonth);
  return !!st && (st.type === "mat" || st.type === "oop");
}
