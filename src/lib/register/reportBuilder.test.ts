import { describe, expect, it } from "vitest";
import { buildReport, reportSummary } from "./report";
import { emptyBlob } from "./blob";
import type { RegisterBlob } from "./types";

// Two academic years: 2025/26 runs Aug 2025 – Jul 2026, 2026/27 from Aug 2026.
const sessions = [
  { id: "a1", month: "2025-09", title: "Sep 25" },
  { id: "a2", month: "2026-02", title: "Feb 26" },
  { id: "b1", month: "2026-09", title: "Sep 26" },
];

function blob(overrides: Partial<RegisterBlob> = {}): RegisterBlob {
  return {
    ...emptyBlob(),
    trainees: [
      { id: "t1", name: "Alice" },
      { id: "t2", name: "Bob" },
      { id: "t3", name: "Carol" },
    ],
    sessions,
    attendance: { "t1|a1": true, "t1|a2": true, "t1|b1": true, "t2|a1": true },
    ...overrides,
  };
}

describe("buildReport", () => {
  it("scopes sessions to the selected years", () => {
    const report = buildReport(blob(), { years: ["2025/26"] });
    expect(report.sessions.map((s) => s.id)).toEqual(["a1", "a2"]);
  });

  it("treats one year as a single table whatever the layout says", () => {
    for (const layout of ["per", "combined", "both"] as const) {
      const report = buildReport(blob(), { years: ["2025/26"], layout });
      expect(report.sections).toHaveLength(1);
      expect(report.sections[0].title).toBe("Academic year 2025/26");
      expect(report.sections[0].subtitle).toBe("Aug 2025 – Jul 2026");
    }
  });

  it("gives one section per year", () => {
    const report = buildReport(blob(), { years: ["2025/26", "2026/27"], layout: "per" });
    expect(report.sections.map((s) => s.title))
      .toEqual(["Academic year 2025/26", "Academic year 2026/27"]);
  });

  it("gives one combined section", () => {
    const report = buildReport(blob(), { years: ["2025/26", "2026/27"], layout: "combined" });
    expect(report.sections).toHaveLength(1);
    expect(report.sections[0].title).toBe("All selected years");
    expect(report.sections[0].sessions).toHaveLength(3);
  });

  it("gives the combined overview first, then each year", () => {
    const report = buildReport(blob(), { years: ["2025/26", "2026/27"], layout: "both" });
    expect(report.sections.map((s) => s.title))
      .toEqual(["All selected years", "Academic year 2025/26", "Academic year 2026/27"]);
  });

  it("sorts the years however they were passed in", () => {
    const report = buildReport(blob(), { years: ["2026/27", "2025/26"], layout: "per" });
    expect(report.years).toEqual(["2025/26", "2026/27"]);
    expect(report.sections[0].title).toBe("Academic year 2025/26");
  });

  it("skips a selected year that has no teaching days", () => {
    const report = buildReport(blob(), { years: ["2025/26", "2030/31"], layout: "per" });
    expect(report.sections.map((s) => s.title)).toEqual(["Academic year 2025/26"]);
  });

  describe("who is included", () => {
    const withStatuses = blob({
      status: [
        { id: "s1", trainee: "t2", type: "cct", start: null, end: "2030-01" },
        { id: "s2", trainee: "t3", type: "idt_out", start: "2030-01", end: null },
      ],
    });

    it("keeps everybody by default", () => {
      const report = buildReport(withStatuses, { years: ["2025/26"], hideNoEligible: false });
      expect(report.sections[0].rows.map((r) => r.trainee.name)).toEqual(["Alice", "Bob", "Carol"]);
    });

    it("drops trainees who have completed training when asked", () => {
      const report = buildReport(withStatuses, {
        years: ["2025/26"], includeCct: false, hideNoEligible: false,
      });
      expect(report.sections[0].rows.map((r) => r.trainee.name)).toEqual(["Alice", "Carol"]);
    });

    it("drops trainees who transferred out when asked", () => {
      const report = buildReport(withStatuses, {
        years: ["2025/26"], includeIdtOut: false, hideNoEligible: false,
      });
      expect(report.sections[0].rows.map((r) => r.trainee.name)).toEqual(["Alice", "Bob"]);
    });

    it("hides rows with no eligible session, leave included", () => {
      // Stricter than the dashboard's filter, which spares somebody on leave.
      // A report row that could only ever read "—" is noise.
      const onLeave = blob({
        status: [{ id: "s1", trainee: "t3", type: "mat", start: "2020-01", end: null }],
      });
      const report = buildReport(onLeave, { years: ["2025/26"], hideNoEligible: true });
      expect(report.sections[0].rows.map((r) => r.trainee.name)).toEqual(["Alice", "Bob"]);
    });

    it("sorts rows by name", () => {
      const report = buildReport(blob(), { years: ["2025/26"], hideNoEligible: false });
      expect(report.sections[0].rows.map((r) => r.trainee.name)).toEqual(["Alice", "Bob", "Carol"]);
    });
  });

  it("computes headline figures across everything selected, not per section", () => {
    const report = buildReport(blob(), {
      years: ["2025/26", "2026/27"], layout: "per", hideNoEligible: false,
    });
    const alice = report.overall.find((r) => r.trainee.name === "Alice")!;
    expect(alice.eligible).toBe(3);      // all three days, both years
    expect(alice.attended).toBe(3);
  });

  it("returns empty sections for a register with nothing in it", () => {
    const report = buildReport(emptyBlob(), { years: ["2025/26"] });
    expect(report.sessions).toEqual([]);
    expect(report.overall).toEqual([]);
  });

  it("returns no sections when no year is selected", () => {
    const report = buildReport(blob(), { years: [] });
    expect(report.sections).toEqual([]);
    expect(report.sessions).toEqual([]);
  });
});

describe("reportSummary", () => {
  it("totals the cohort and bands it", () => {
    const report = buildReport(blob(), { years: ["2025/26"], hideNoEligible: false });
    const summary = reportSummary(report.overall);

    expect(summary.trainees).toBe(3);
    expect(summary.attended).toBe(3);          // Alice 2, Bob 1, Carol 0
    expect(summary.eligible).toBe(6);          // 3 trainees x 2 days
    expect(summary.adjPct).toBe(50);
    expect(summary.atOrAbove80).toBe(1);       // Alice at 100%
    expect(summary.below60).toBe(2);           // Bob 50%, Carol 0%
  });

  it("removes excused sessions from the cohort denominator too", () => {
    const excused = blob({
      excused: [{ id: "e1", trainee: "t2", session: "a2", reason: "", ts: "" }],
    });
    const report = buildReport(excused, { years: ["2025/26"], hideNoEligible: false });
    const summary = reportSummary(report.overall);

    expect(summary.excused).toBe(1);
    expect(summary.eligible).toBe(6);
    expect(summary.adjPct).toBe(60);           // 3 of 5
  });

  it("gives null rather than a nonsense percentage when nothing counted", () => {
    expect(reportSummary([]).adjPct).toBeNull();
  });
});
