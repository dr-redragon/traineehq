import { describe, expect, it } from "vitest";
import { computeRow, computeRows } from "./report";
import { EMPTY_REGISTER, type RegisterBlob } from "./types";

const sessions = [
  { id: "s1", month: "2025-09", title: "September" },
  { id: "s2", month: "2025-10", title: "October" },
  { id: "s3", month: "2025-11", title: "November" },
  { id: "s4", month: "2025-12", title: "December" },
];

function blob(overrides: Partial<RegisterBlob> = {}): RegisterBlob {
  return {
    ...EMPTY_REGISTER,
    trainees: [{ id: "t1", name: "Alice" }],
    sessions,
    ...overrides,
  };
}

const trainee = { id: "t1", name: "Alice" };

describe("computeRow", () => {
  it("counts a perfect record", () => {
    const row = computeRow(
      blob({ attendance: { "t1|s1": true, "t1|s2": true, "t1|s3": true, "t1|s4": true } }),
      trainee,
      sessions,
    );

    expect(row).toMatchObject({
      attended: 4, total: 4, eligible: 4, excused: 0, adjDenom: 4, rawPct: 100, adjPct: 100,
    });
  });

  it("counts a blank record", () => {
    const row = computeRow(blob(), trainee, sessions);
    expect(row).toMatchObject({ attended: 0, eligible: 4, rawPct: 0, adjPct: 0 });
  });

  it("removes excused sessions from the adjusted denominator only", () => {
    const row = computeRow(
      blob({
        attendance: { "t1|s1": true, "t1|s2": true },
        excused: [{ id: "e1", trainee: "t1", session: "s3", reason: "On call", ts: "" }],
      }),
      trainee,
      sessions,
    );

    expect(row.attended).toBe(2);
    expect(row.eligible).toBe(4);
    expect(row.excused).toBe(1);
    expect(row.adjDenom).toBe(3);
    expect(row.rawPct).toBe(50);        // 2 of 4 sessions
    expect(row.adjPct).toBe(67);        // 2 of 3 they could have attended
  });

  it("removes ineligible months from both figures — that is the point", () => {
    // On leave for the first half, present for both eligible days.
    const row = computeRow(
      blob({
        attendance: { "t1|s3": true, "t1|s4": true },
        status: [{ id: "st1", trainee: "t1", type: "mat", start: "2025-09", end: "2025-10" }],
      }),
      trainee,
      sessions,
    );

    expect(row.eligible).toBe(2);
    expect(row.adjPct).toBe(100);       // perfect on the days that counted
    expect(row.total).toBe(4);
    expect(row.rawPct).toBe(50);        // a naive count would call this half
  });

  it("gives adjPct null, not zero, when no session was ever eligible", () => {
    const row = computeRow(
      blob({ status: [{ id: "st1", trainee: "t1", type: "cct", start: null, end: "2020-01" }] }),
      trainee,
      sessions,
    );

    expect(row.eligible).toBe(0);
    expect(row.adjPct).toBeNull();
    expect(row.rawPct).toBe(0);
  });

  it("gives adjPct zero when every eligible session was excused", () => {
    // adjDenom is 0, but they were on the programme — distinct from null above.
    const row = computeRow(
      blob({
        sessions: [sessions[0]],
        excused: [{ id: "e1", trainee: "t1", session: "s1", reason: "", ts: "" }],
      }),
      trainee,
      [sessions[0]],
    );

    expect(row.eligible).toBe(1);
    expect(row.adjDenom).toBe(0);
    expect(row.adjPct).toBe(0);
  });

  it("handles an empty scope without dividing by zero", () => {
    const row = computeRow(blob(), trainee, []);
    expect(row).toMatchObject({ attended: 0, total: 0, eligible: 0, rawPct: 0, adjPct: null });
    expect(row.cells).toHaveLength(0);
  });

  it("returns a cell per session, in scope order", () => {
    const row = computeRow(blob({ attendance: { "t1|s2": true } }), trainee, sessions);
    expect(row.cells.map((c) => c.state)).toEqual(["absent", "present", "absent", "absent"]);
  });

  it("rounds to whole percentages", () => {
    const row = computeRow(blob({ attendance: { "t1|s1": true } }), trainee, sessions.slice(0, 3));
    expect(row.rawPct).toBe(33);        // 1/3
  });
});

describe("computeRows", () => {
  const people = blob({
    trainees: [
      { id: "t1", name: "Alice" },
      { id: "t2", name: "Bob" },
      { id: "t3", name: "Carol" },
    ],
    attendance: { "t1|s1": true, "t1|s2": true, "t1|s3": true, "t2|s1": true },
  });

  it("matches the search box case-insensitively", () => {
    expect(computeRows(people, sessions, { search: "ali" }).rows.map((r) => r.trainee.name))
      .toEqual(["Alice"]);
    expect(computeRows(people, sessions, { search: "BOB" }).rows.map((r) => r.trainee.name))
      .toEqual(["Bob"]);
    expect(computeRows(people, sessions, { search: "  " }).rows).toHaveLength(3);
  });

  it("sorts by name ascending by default", () => {
    expect(computeRows(people, sessions).rows.map((r) => r.trainee.name))
      .toEqual(["Alice", "Bob", "Carol"]);
  });

  it("reverses on sortDir", () => {
    expect(computeRows(people, sessions, { sortDir: -1 }).rows.map((r) => r.trainee.name))
      .toEqual(["Carol", "Bob", "Alice"]);
  });

  it("sorts by attendance and by each percentage", () => {
    expect(computeRows(people, sessions, { sortKey: "att", sortDir: -1 }).rows[0].trainee.name)
      .toBe("Alice");
    expect(computeRows(people, sessions, { sortKey: "raw", sortDir: -1 }).rows[0].trainee.name)
      .toBe("Alice");
    expect(computeRows(people, sessions, { sortKey: "adj", sortDir: -1 }).rows[0].trainee.name)
      .toBe("Alice");
  });

  it("parks a null adjusted percentage below zero rather than above it", () => {
    const withCct = blob({
      trainees: [{ id: "t1", name: "Alice" }, { id: "t2", name: "Bob" }],
      status: [{ id: "st1", trainee: "t2", type: "cct", start: null, end: "2020-01" }],
    });
    // Alice is 0%, Bob is null. Ascending, null must come first.
    expect(computeRows(withCct, sessions, { sortKey: "adj" }).rows.map((r) => r.trainee.name))
      .toEqual(["Bob", "Alice"]);
  });

  describe("hideNotInProgramme", () => {
    it("hides someone who was never eligible, and counts them", () => {
      const withCct = blob({
        trainees: [{ id: "t1", name: "Alice" }, { id: "t2", name: "Bob" }],
        status: [{ id: "st1", trainee: "t2", type: "cct", start: null, end: "2020-01" }],
      });
      const { rows, hidden } = computeRows(withCct, sessions, { hideNotInProgramme: true });

      expect(rows.map((r) => r.trainee.name)).toEqual(["Alice"]);
      expect(hidden).toBe(1);
    });

    it("keeps someone on leave visible — a leave is not a departure", () => {
      const onLeave = blob({
        trainees: [{ id: "t1", name: "Alice" }, { id: "t2", name: "Bob" }],
        status: [{ id: "st1", trainee: "t2", type: "mat", start: "2025-01", end: "2026-06" }],
      });
      const { rows, hidden } = computeRows(onLeave, sessions, { hideNotInProgramme: true });

      expect(rows.map((r) => r.trainee.name)).toEqual(["Alice", "Bob"]);
      expect(hidden).toBe(0);
    });

    it("judges leave as at the end of the scope, not today", () => {
      // Leave that ended long before this scope: by the last month in scope they
      // were back, so they are a genuine non-member here and get hidden.
      const returned = blob({
        trainees: [{ id: "t2", name: "Bob" }],
        status: [
          { id: "st1", trainee: "t2", type: "mat", start: "2020-01", end: "2020-06" },
          { id: "st2", trainee: "t2", type: "idt_out", start: "2021-01", end: null },
        ],
      });
      const { rows, hidden } = computeRows(returned, sessions, { hideNotInProgramme: true });

      expect(rows).toHaveLength(0);
      expect(hidden).toBe(1);
    });

    it("does nothing when the scope has no sessions", () => {
      const { rows, hidden } = computeRows(people, [], { hideNotInProgramme: true });
      expect(rows).toHaveLength(3);
      expect(hidden).toBe(0);
    });
  });

  it("handles a register with no trainees", () => {
    const { rows, hidden } = computeRows(blob({ trainees: [] }), sessions);
    expect(rows).toEqual([]);
    expect(hidden).toBe(0);
  });
});
