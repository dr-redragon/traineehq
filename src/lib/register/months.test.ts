import { describe, expect, it } from "vitest";
import {
  ALL_YEARS, academicYearLabel, academicYearOf, academicYearRange, academicYearStart,
  availableAcademicYears, currentAcademicYear, currentMonth, defaultAcademicYear,
  formatMonth, parseMonth, sessionsInYear, sessionsSorted,
} from "./months";
import type { RegisterSession } from "./types";

const session = (id: string, month: string): RegisterSession => ({ id, month, title: id });

describe("parseMonth", () => {
  it.each([
    ["2026-01", "2026-01"],
    ["2026/1", "2026-01"],
    ["2026 1", "2026-01"],
    ["01-2026", "2026-01"],
    ["1/2026", "2026-01"],
    ["01/26", "2026-01"],
    ["202601", "2026-01"],
    ["Jan 2026", "2026-01"],
    ["january 2026", "2026-01"],
    ["JANUARY 2026", "2026-01"],
    ["2026 March", "2026-03"],
    ["mar 2026", "2026-03"],
    ["sept 26", "2026-09"],
    ["september 2026", "2026-09"],
    ["sep 2026", "2026-09"],
    ["Dec 2025", "2025-12"],
    ["  Jan   2026  ", "2026-01"],
    ["Jan. 2026", "2026-01"],
    ["Jan, 2026", "2026-01"],
  ])("reads %j as %j", (input, expected) => {
    expect(parseMonth(input)).toBe(expected);
  });

  it.each([
    ["", ""],
    ["   ", ""],
    ["nonsense", ""],
    ["2026-13", ""],
    ["13/2026", ""],
    ["2026-00", ""],
    ["2026", ""],
  ])("cannot read %j", (input, expected) => {
    expect(parseMonth(input)).toBe(expected);
  });

  it("handles null and undefined", () => {
    expect(parseMonth(null)).toBe("");
    expect(parseMonth(undefined)).toBe("");
  });

  it("reads YYYY-MM before MM-YYYY, so 2026-01 is January 2026", () => {
    expect(parseMonth("2026-01")).toBe("2026-01");
  });
});

describe("formatMonth", () => {
  it("renders a month and year", () => {
    expect(formatMonth("2026-01", "en-GB")).toBe("Jan 2026");
    expect(formatMonth("2025-12", "en-GB")).toBe("Dec 2025");
  });

  it("is empty for empty or malformed input", () => {
    expect(formatMonth("")).toBe("");
    expect(formatMonth(null)).toBe("");
    expect(formatMonth("rubbish")).toBe("");
  });

  it("round-trips with parseMonth", () => {
    expect(parseMonth(formatMonth("2026-09", "en-GB"))).toBe("2026-09");
  });
});

describe("academic years (August to July)", () => {
  it("starts a new year in August", () => {
    expect(academicYearStart("2025-07")).toBe(2024);
    expect(academicYearStart("2025-08")).toBe(2025);
    expect(academicYearStart("2026-07")).toBe(2025);
    expect(academicYearStart("2026-08")).toBe(2026);
  });

  it("labels a year by both of its calendar years", () => {
    expect(academicYearLabel(2025)).toBe("2025/26");
    expect(academicYearLabel(1999)).toBe("1999/00");
    expect(academicYearLabel(2009)).toBe("2009/10");
  });

  it("maps a month to its academic year", () => {
    expect(academicYearOf("2025-08")).toBe("2025/26");
    expect(academicYearOf("2026-07")).toBe("2025/26");
    expect(academicYearOf("2026-08")).toBe("2026/27");
  });

  it("spells out a year's range", () => {
    expect(academicYearRange("2025/26")).toBe("Aug 2025 – Jul 2026");
  });

  it("derives the current year from a date", () => {
    expect(currentAcademicYear(new Date(2026, 6, 15))).toBe("2025/26");  // July
    expect(currentAcademicYear(new Date(2026, 7, 1))).toBe("2026/27");   // August
  });

  it("derives the current month from a date", () => {
    expect(currentMonth(new Date(2026, 0, 15))).toBe("2026-01");
    expect(currentMonth(new Date(2026, 11, 1))).toBe("2026-12");
  });
});

describe("session scoping", () => {
  const sessions = [
    session("c", "2026-09"),
    session("a", "2025-09"),
    session("b", "2026-02"),
  ];

  it("sorts oldest first without mutating the input", () => {
    const before = [...sessions];
    expect(sessionsSorted(sessions).map((s) => s.id)).toEqual(["a", "b", "c"]);
    expect(sessions).toEqual(before);
  });

  it("lists the academic years that have sessions, oldest first", () => {
    expect(availableAcademicYears(sessions)).toEqual(["2025/26", "2026/27"]);
  });

  it("scopes to one year, spanning the calendar-year boundary", () => {
    expect(sessionsInYear(sessions, "2025/26").map((s) => s.id)).toEqual(["a", "b"]);
    expect(sessionsInYear(sessions, "2026/27").map((s) => s.id)).toEqual(["c"]);
  });

  describe("defaultAcademicYear", () => {
    it("opens on the current year when it has sessions", () => {
      expect(defaultAcademicYear(sessions, new Date(2026, 9, 1))).toBe("2026/27");
    });

    it("falls back to the most recent year that has any", () => {
      expect(defaultAcademicYear(sessions, new Date(2030, 0, 1))).toBe("2026/27");
    });

    it("returns the all-years sentinel for an empty register", () => {
      expect(defaultAcademicYear([], new Date())).toBe(ALL_YEARS);
    });
  });
});
