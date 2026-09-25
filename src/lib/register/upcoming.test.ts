import { describe, expect, it } from "vitest";
import { cellState, isUpcoming } from "./eligibility";
import { computeRow, computeRows } from "./report";
import { unexplainedAbsentees } from "./chase";
import { EMPTY_REGISTER, type RegisterBlob } from "./types";

/*
 * A teaching day that has not happened yet counts neither way — it is nobody's
 * absence until it has been and gone. Without a date to judge by, every day
 * counts, which is how the original register behaved and what parity.test.ts
 * holds it to.
 */

const TODAY = "2026-03-15";
const past = { id: "p", month: "2026-03", date: "2026-03-04", title: "Past" };
const later = { id: "l", month: "2026-03", date: "2026-03-25", title: "Later this month" };
const nextMonth = { id: "n", month: "2026-04", title: "Undated, next month" };

const blob: RegisterBlob = {
  ...EMPTY_REGISTER,
  trainees: [{ id: "t1", name: "Alice" }, { id: "t2", name: "Bo" }],
  sessions: [past, later, nextMonth],
  attendance: { "t1|p": true },
  excused: [{ id: "x", trainee: "t2", session: "l", reason: "Annual Leave", ts: "1" }],
};

describe("teaching days not held yet", () => {
  it("is upcoming after today, by date or by month; today itself has happened", () => {
    expect(isUpcoming(later, TODAY)).toBe(true);
    expect(isUpcoming(nextMonth, TODAY)).toBe(true);
    expect(isUpcoming(past, TODAY)).toBe(false);
    expect(isUpcoming({ ...later, date: TODAY }, TODAY)).toBe(false);
    expect(isUpcoming({ ...nextMonth, month: "2026-03" }, TODAY)).toBe(false);
    expect(isUpcoming(later)).toBe(false);
  });

  it("reads upcoming rather than missed, but keeps an advance tick or excusal", () => {
    expect(cellState(blob, "t1", later, TODAY)).toBe("upcoming");
    expect(cellState(blob, "t2", later, TODAY)).toBe("excused");
    expect(cellState(blob, "t1", later)).toBe("absent");
  });

  it("leaves upcoming days out of every figure", () => {
    const row = computeRow(blob, blob.trainees[0], [past, later, nextMonth], TODAY);
    expect(row).toMatchObject({ attended: 1, total: 1, eligible: 1, rawPct: 100, adjPct: 100 });

    const excusedAhead = computeRow(blob, blob.trainees[1], [past, later, nextMonth], TODAY);
    expect(excusedAhead).toMatchObject({ total: 1, excused: 0, rawPct: 0, adjPct: 0 });

    // Without today, the original rule: everything counts.
    expect(computeRow(blob, blob.trainees[0], [past, later, nextMonth])).toMatchObject({ total: 3, rawPct: 33 });
  });

  it("does not hide a cohort whose days are all still to come", () => {
    const { rows, hidden } = computeRows(blob, [later, nextMonth], { hideNotInProgramme: true, asOf: TODAY });
    expect(rows).toHaveLength(2);
    expect(hidden).toBe(0);
  });

  it("has nobody to chase for a day that has not happened", () => {
    expect(unexplainedAbsentees(blob, nextMonth, TODAY)).toEqual([]);
    expect(unexplainedAbsentees(blob, past, TODAY).map((t) => t.id)).toEqual(["t2"]);
  });
});
