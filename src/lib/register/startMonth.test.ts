import { describe, expect, it } from "vitest";
import { backfillStartMonths, needsStartBackfill, startMonthForNew } from "./blob";
import { beforeStart, cellState, isEligible, startedBy } from "./eligibility";
import { buildReport, computeRow, computeRows, sessionStats } from "./report";
import { EMPTY_REGISTER, type RegisterBlob } from "./types";

/** Two academic years: 2025/26 (Oct, Mar) and 2026/27 (Sep). */
const sessions = [
  { id: "a", month: "2025-10", title: "Otology" },
  { id: "b", month: "2026-03", title: "Rhinology" },
  { id: "c", month: "2026-09", title: "Head and neck" },
];
const y2526 = sessions.slice(0, 2);
const NOW = new Date(2026, 9, 12); // 12 Oct 2026, academic year 2026/27

function register(overrides: Partial<RegisterBlob> = {}): RegisterBlob {
  return {
    ...EMPTY_REGISTER,
    sessions,
    trainees: [
      { id: "old", name: "Established", startMonth: "" },
      { id: "new", name: "New ST3", grade: "ST3", startMonth: "2026-08" },
    ],
    attendance: { "old|a": { grade: "ST4" }, "old|c": { grade: "ST5" }, "new|c": { grade: "ST3" } },
    ...overrides,
  };
}

describe("start month", () => {
  it("makes days before the start not the trainee's", () => {
    const b = register();
    expect(beforeStart(b, "new", "2026-03")).toBe(true);
    expect(beforeStart(b, "new", "2026-09")).toBe(false);
    expect(isEligible(b, "new", "2026-03")).toBe(false);
    expect(cellState(b, "new", sessions[0])).toBe("na");
    expect(beforeStart(b, "old", "2020-01")).toBe(false);
  });

  it("knows whether a trainee had joined by the end of a scope", () => {
    const b = register();
    expect(startedBy(b, "new", y2526)).toBe(false);
    expect(startedBy(b, "new", sessions)).toBe(true);
    expect(startedBy(b, "old", y2526)).toBe(true);
  });

  it("keeps earlier days out of the trainee's own totals", () => {
    const row = computeRow(register(), { id: "new", name: "New ST3" }, sessions);
    expect(row.total).toBe(1);
    expect(row.attended).toBe(1);
    expect(row.rawPct).toBe(100);
    expect(row.adjPct).toBe(100);
  });

  it("leaves a trainee out of a year that ended before they joined", () => {
    const names = computeRows(register(), y2526).rows.map((r) => r.trainee.name);
    expect(names).toEqual(["Established"]);
  });

  it("leaves them out of earlier years in the report, and its headline figures", () => {
    const report = buildReport(register(), { years: ["2025/26", "2026/27"], layout: "both" });
    const [combined, y1, y2] = report.sections;
    expect(combined.rows.map((r) => r.trainee.id).sort()).toEqual(["new", "old"]);
    expect(y1.rows.map((r) => r.trainee.id)).toEqual(["old"]);
    expect(y2.rows.map((r) => r.trainee.id).sort()).toEqual(["new", "old"]);

    const only2526 = buildReport(register(), { years: ["2025/26"] });
    expect(only2526.overall.map((r) => r.trainee.id)).toEqual(["old"]);
  });
});

describe("sessionStats", () => {
  it("counts each day over the section's trainees", () => {
    const b = register({
      trainees: [
        { id: "p", name: "P" }, { id: "x", name: "X" }, { id: "e", name: "E" }, { id: "m", name: "M" },
      ],
      attendance: { "p|a": true },
      excused: [{ id: "1", trainee: "e", session: "a", reason: "", ts: "" }],
      status: [{ id: "s", trainee: "m", type: "mat", start: "2025-09", end: "2025-12" }],
    });
    const rows = computeRows(b, [sessions[0]]).rows;
    const [a] = sessionStats(b, rows, [sessions[0]]);
    expect(a).toMatchObject({ attended: 1, absent: 1, excused: 1, notEligible: 1, eligible: 3, rate: 50 });
  });

  it("does not count somebody who had not joined yet, even as not eligible", () => {
    const b = register();
    const rows = computeRows(b, sessions).rows;
    const stats = sessionStats(b, rows, sessions);
    expect(stats[1]).toMatchObject({ attended: 0, absent: 1, notEligible: 0, eligible: 1, rate: 0 });
    expect(stats[2]).toMatchObject({ attended: 2, absent: 0, eligible: 2, rate: 100 });
  });

  it("gives a day that has not happened yet no absences and no rate", () => {
    const b = register();
    const rows = computeRows(b, sessions, { asOf: "2026-08-01" }).rows;
    const [, , c] = sessionStats(b, rows, sessions, "2026-08-01");
    expect(c.upcoming).toBe(true);
    expect(c.absent).toBe(0);
    expect(c.rate).toBeNull();
  });
});

describe("startMonthForNew", () => {
  it("uses what was typed, else this August for an ST3, else nothing", () => {
    expect(startMonthForNew("2026-02", "ST3", NOW)).toBe("2026-02");
    expect(startMonthForNew("", "ST3", NOW)).toBe("2026-08");
    expect(startMonthForNew("", "ST5", NOW)).toBe("");
    expect(startMonthForNew("", undefined, NOW)).toBe("");
  });
});

describe("backfillStartMonths", () => {
  const legacy = (overrides: Partial<RegisterBlob> = {}): RegisterBlob => ({
    ...EMPTY_REGISTER,
    sessions,
    trainees: [
      { id: "graded", name: "Signed in 25/26 as ST3, then pat leave", grade: "ST3" },
      { id: "ungraded", name: "Marked present 25/26, no grade", grade: "ST3" },
      { id: "leave", name: "No sign-ins, pat leave from Sep 2025", grade: "ST3" },
      { id: "excused", name: "No sign-ins, excused 25/26", grade: "ST3" },
      { id: "new", name: "Brand new ST3", grade: "ST3" },
      { id: "senior", name: "ST6, no sign-ins", grade: "ST6" },
      { id: "set", name: "Already has one", grade: "ST3", startMonth: "2024-08" },
    ],
    attendance: { "graded|a": { grade: "ST3" }, "ungraded|a": true },
    excused: [{ id: "x", trainee: "excused", session: "b", reason: "", ts: "" }],
    status: [
      { id: "1", trainee: "leave", type: "mat", start: "2025-09", end: null },
      { id: "2", trainee: "graded", type: "mat", start: "2026-01", end: null },
    ],
    ...overrides,
  });

  const startOf = (b: RegisterBlob) => Object.fromEntries(b.trainees.map((t) => [t.id, t.startMonth]));

  it("works out a start for trainees saved without one", () => {
    expect(startOf(backfillStartMonths(legacy(), NOW))).toEqual({
      graded: "2025-08",
      ungraded: "",
      leave: "",
      excused: "",
      new: "2026-08",
      senior: "",
      set: "2024-08",
    });
  });

  it("dates an ST3 from an earlier ungraded sign-in if there was one", () => {
    const b = legacy({ attendance: { "graded|a": true, "graded|c": { grade: "ST3" } } });
    expect(startOf(backfillStartMonths(b, NOW)).graded).toBe("2025-08");
  });

  it("runs once: a backfilled register needs nothing more", () => {
    const once = backfillStartMonths(legacy(), NOW);
    expect(needsStartBackfill(once)).toBe(false);
    expect(backfillStartMonths(once, NOW)).toBe(once);
  });

  it("does not touch the blob it is given", () => {
    const b = legacy();
    const before = JSON.stringify(b);
    backfillStartMonths(b, NOW);
    expect(JSON.stringify(b)).toBe(before);
  });
});
