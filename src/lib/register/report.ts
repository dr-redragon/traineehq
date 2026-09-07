import type { RegisterBlob, RegisterSession, RegisterTrainee } from "./types";
import { cellState, isOnLeave, type CellState } from "./eligibility";
import { academicYearOf, academicYearRange, sessionsInYear, sessionsSorted } from "./months";

/**
 * Turning attendance into the numbers the register reports.
 *
 * Two percentages, and the difference between them is the point of the whole
 * register:
 *
 *   raw       attended out of every session in scope, ineligible ones included.
 *   adjusted  attended out of the sessions they could actually have come to —
 *             ineligible months removed, then excused absences removed as well.
 *
 * Adjusted is the fair one, and the one a trainee is held to; raw is kept
 * because it is what a naive count would say, and the gap between them is the
 * allowance being made.
 */

export interface AttendanceCell {
  session: RegisterSession;
  state: CellState;
}

export interface AttendanceRow {
  trainee: RegisterTrainee;
  cells: AttendanceCell[];
  /** Sessions marked present. */
  attended: number;
  /** Every session in scope, whether or not this trainee was eligible. */
  total: number;
  /** Eligible sessions they were excused from. */
  excused: number;
  /** Sessions they were expected at. */
  eligible: number;
  /** The adjusted denominator: eligible minus excused. */
  adjDenom: number;
  rawPct: number;
  /**
   * null when there is nothing to be a percentage of — the trainee was eligible
   * for none of these sessions. Distinct from 0, which means they were expected
   * and came to none.
   */
  adjPct: number | null;
}

/** One trainee's row over one scope of sessions. */
export function computeRow(
  blob: RegisterBlob,
  trainee: RegisterTrainee,
  sessions: RegisterSession[],
): AttendanceRow {
  let attended = 0;
  let total = 0;
  let excused = 0;
  let eligible = 0;
  const cells: AttendanceCell[] = [];

  for (const session of sessions) {
    const state = cellState(blob, trainee.id, session);
    cells.push({ session, state });
    total++;
    if (state === "na") continue;
    eligible++;
    if (state === "present") attended++;
    if (state === "excused") excused++;
  }

  const adjDenom = eligible - excused;

  return {
    trainee,
    cells,
    attended,
    total,
    excused,
    eligible,
    adjDenom,
    rawPct: total ? Math.round((attended / total) * 100) : 0,
    adjPct: adjDenom > 0 ? Math.round((attended / adjDenom) * 100) : eligible === 0 ? null : 0,
  };
}

export type SortKey = "name" | "att" | "raw" | "adj";

export interface RowOptions {
  /** Case-insensitive substring match on the trainee's name. */
  search?: string;
  /** Hide trainees who were not in the programme for any of these sessions. */
  hideNotInProgramme?: boolean;
  sortKey?: SortKey;
  /** 1 ascending, -1 descending. */
  sortDir?: 1 | -1;
}

export interface RowResult {
  rows: AttendanceRow[];
  /** How many trainees `hideNotInProgramme` removed, for the "n hidden" note. */
  hidden: number;
}

/**
 * The rows for one scope of sessions, filtered and sorted as the table shows them.
 *
 * `hideNotInProgramme` is narrower than "no eligible sessions". Someone on
 * maternity or OOP leave for the whole scope stays visible, because that is a
 * leave and they are still on the programme; only a genuine non-member of the
 * scope — CCT'd, transferred out, not yet arrived, or never eligible — is
 * dropped. Leave is judged as at the last month in scope, so a past year is
 * judged by where the trainee stood then rather than where they stand today.
 */
export function computeRows(
  blob: RegisterBlob,
  sessions: RegisterSession[],
  options: RowOptions = {},
): RowResult {
  const { search = "", hideNotInProgramme = false, sortKey = "name", sortDir = 1 } = options;

  const needle = search.trim().toLowerCase();
  let rows = blob.trainees
    .filter((t) => t.name.toLowerCase().includes(needle))
    .map((t) => computeRow(blob, t, sessions));

  let hidden = 0;
  if (hideNotInProgramme && sessions.length) {
    const cutoff = sessions[sessions.length - 1].month;
    const onLeave = (r: AttendanceRow) => isOnLeave(blob, r.trainee.id, cutoff);
    hidden = rows.filter((r) => r.eligible === 0 && !onLeave(r)).length;
    rows = rows.filter((r) => r.eligible > 0 || onLeave(r));
  }

  rows.sort((a, b) => {
    let A: string | number;
    let B: string | number;
    if (sortKey === "name") {
      A = a.trainee.name;
      B = b.trainee.name;
    } else if (sortKey === "raw") {
      A = a.rawPct;
      B = b.rawPct;
    } else if (sortKey === "adj") {
      // null sorts below 0 — "never eligible" reads as worse than "eligible and
      // never came" would be misleading, so it is parked at the bottom instead.
      A = a.adjPct ?? -1;
      B = b.adjPct ?? -1;
    } else {
      A = a.attended;
      B = b.attended;
    }
    if (A < B) return -1 * sortDir;
    if (A > B) return 1 * sortDir;
    return 0;
  });

  return { rows, hidden };
}

/** Every trainee's row across every session in the register. */
export function computeAllRows(blob: RegisterBlob, options?: RowOptions): RowResult {
  return computeRows(blob, sessionsSorted(blob.sessions), options);
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

export type ReportLayout = "per" | "combined" | "both";

export interface ReportOptions {
  /** Academic year labels, e.g. ["2025/26"]. */
  years: string[];
  /** Ignored when only one year is selected — one year is one table either way. */
  layout?: ReportLayout;
  /** Keep trainees who have completed training. */
  includeCct?: boolean;
  /** Keep trainees who transferred out of the deanery. */
  includeIdtOut?: boolean;
  /** Drop trainees with no eligible session in the section. */
  hideNoEligible?: boolean;
}

export interface ReportSection {
  title: string;
  subtitle: string;
  sessions: RegisterSession[];
  rows: AttendanceRow[];
}

export interface Report {
  sections: ReportSection[];
  /** Headline figures, always across everything selected. */
  overall: AttendanceRow[];
  /** Every session in scope, across all selected years. */
  sessions: RegisterSession[];
  years: string[];
}

/**
 * Build the attendance report.
 *
 * Note that `hideNoEligible` is stricter here than the dashboard's "hide
 * trainees not in programme": a report drops anybody with no eligible session
 * full stop, including somebody on maternity or OOP leave for the whole period,
 * where the dashboard keeps them visible. That is deliberate in the original and
 * kept — a dashboard is a working view where someone on leave should still be
 * findable, and a report is a statement about attendance, where a row that could
 * only ever read "—" is noise.
 */
export function buildReport(blob: RegisterBlob, options: ReportOptions): Report {
  const {
    years, layout = "per",
    includeCct = true, includeIdtOut = true, hideNoEligible = true,
  } = options;

  const selected = [...years].sort();

  // Guarded here rather than in the caller. The original relies on its dialog
  // refusing to submit with nothing ticked; a builder that produces a section
  // headed "Academic year undefined" when asked for none is a trap for the next
  // caller, and there will be one — an export, a scheduled email.
  if (!selected.length) {
    return { sections: [], overall: [], sessions: [], years: [] };
  }

  const inScope = sessionsSorted(blob.sessions)
    .filter((s) => selected.includes(academicYearOf(s.month)));

  let trainees = blob.trainees;
  if (!includeCct) {
    trainees = trainees.filter((t) => !hasStatus(blob, t.id, "cct"));
  }
  if (!includeIdtOut) {
    trainees = trainees.filter((t) => !hasStatus(blob, t.id, "idt_out"));
  }

  const section = (
    title: string, subtitle: string, sessions: RegisterSession[],
  ): ReportSection => {
    let rows = trainees.map((t) => computeRow(blob, t, sessions));
    if (hideNoEligible) rows = rows.filter((r) => r.eligible > 0);
    rows.sort((a, b) => a.trainee.name.localeCompare(b.trainee.name));
    return { title, subtitle, sessions, rows };
  };

  // One year selected is a single table whatever the layout says.
  const effective: ReportLayout = selected.length > 1 ? layout : "combined";
  const sections: ReportSection[] = [];

  if (effective === "combined" || effective === "both") {
    sections.push(
      selected.length > 1
        ? section("All selected years", `Combined · ${selected.join(", ")}`, inScope)
        : section(`Academic year ${selected[0]}`, academicYearRange(selected[0]), inScope),
    );
  }

  if (effective === "per" || effective === "both") {
    for (const year of selected) {
      const list = sessionsInYear(blob.sessions, year);
      if (list.length) {
        sections.push(section(`Academic year ${year}`, academicYearRange(year), list));
      }
    }
  }

  let overall = trainees.map((t) => computeRow(blob, t, inScope));
  if (hideNoEligible) overall = overall.filter((r) => r.eligible > 0);

  return { sections, overall, sessions: inScope, years: selected };
}

function hasStatus(blob: RegisterBlob, traineeId: string, type: string): boolean {
  return blob.status.some((s) => s.trainee === traineeId && s.type === type);
}

/** Cohort-level figures for the headline strip. */
export function reportSummary(rows: AttendanceRow[]) {
  const attended = rows.reduce((n, r) => n + r.attended, 0);
  const eligible = rows.reduce((n, r) => n + r.eligible, 0);
  const excused = rows.reduce((n, r) => n + r.excused, 0);
  const denominator = eligible - excused;

  const scored = rows.map((r) => r.adjPct).filter((p): p is number => p !== null);

  return {
    trainees: rows.length,
    attended,
    eligible,
    excused,
    adjPct: denominator > 0 ? Math.round((attended / denominator) * 100) : null,
    /** How many are at or above 80%, the band the register treats as good. */
    atOrAbove80: scored.filter((p) => p >= 80).length,
    below60: scored.filter((p) => p < 60).length,
  };
}
