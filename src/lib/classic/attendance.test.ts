import { describe, expect, it } from "vitest";
import { attendanceKey, gradeAt, isPresent, latestGrade } from "./attendance";
import { EMPTY_REGISTER, type RegisterBlob } from "./types";

const sessions = [
  { id: "s1", month: "2024-09", title: "Old year" },
  { id: "s2", month: "2025-09", title: "This year" },
  { id: "s3", month: "2026-02", title: "Later this year" },
];

function blob(overrides: Partial<RegisterBlob> = {}): RegisterBlob {
  return { ...EMPTY_REGISTER, trainees: [{ id: "t1", name: "Alice" }], sessions, ...overrides };
}

describe("attendanceKey", () => {
  it("joins trainee and session with a pipe", () => {
    expect(attendanceKey("t1", "s1")).toBe("t1|s1");
  });
});

describe("isPresent", () => {
  it("accepts both the object mark and the legacy `true`", () => {
    expect(isPresent(blob({ attendance: { "t1|s1": { grade: "ST6" } } }), "t1", "s1")).toBe(true);
    expect(isPresent(blob({ attendance: { "t1|s1": true } }), "t1", "s1")).toBe(true);
  });

  it("is false for an unmarked cell", () => {
    expect(isPresent(blob(), "t1", "s1")).toBe(false);
  });
});

describe("gradeAt", () => {
  it("reads the grade off the mark", () => {
    expect(gradeAt(blob({ attendance: { "t1|s1": { grade: "ST6" } } }), "t1", "s1")).toBe("ST6");
  });

  it("is empty for a legacy mark, which carries no grade", () => {
    expect(gradeAt(blob({ attendance: { "t1|s1": true } }), "t1", "s1")).toBe("");
  });

  it("is empty for an unmarked cell, and for an object with no grade", () => {
    expect(gradeAt(blob(), "t1", "s1")).toBe("");
    expect(gradeAt(blob({ attendance: { "t1|s1": {} } }), "t1", "s1")).toBe("");
  });
});

describe("latestGrade", () => {
  it("prefers the grade held on the trainee for a view reaching the present", () => {
    const b = blob({
      trainees: [{ id: "t1", name: "Alice", grade: "ST7" }],
      attendance: { "t1|s1": { grade: "ST4" } },
    });
    expect(latestGrade(b, "t1")).toBe("ST7");
  });

  it("falls back to the newest recorded grade when the trainee holds none", () => {
    const b = blob({
      attendance: { "t1|s1": { grade: "ST4" }, "t1|s2": { grade: "ST5" } },
    });
    expect(latestGrade(b, "t1")).toBe("ST5");
  });

  it("reads a past year's grade from that year, not from today", () => {
    // Alice is ST7 now, but was ST4 in 2024/25. A historical table must not
    // relabel her with a grade she did not hold at the time.
    const b = blob({
      trainees: [{ id: "t1", name: "Alice", grade: "ST7" }],
      attendance: { "t1|s1": { grade: "ST4" }, "t1|s2": { grade: "ST5" } },
    });
    expect(latestGrade(b, "t1", [sessions[0]])).toBe("ST4");
  });

  it("uses the stored grade for a scope that reaches the newest session", () => {
    const b = blob({
      trainees: [{ id: "t1", name: "Alice", grade: "ST7" }],
      attendance: { "t1|s1": { grade: "ST4" } },
    });
    expect(latestGrade(b, "t1", sessions)).toBe("ST7");
  });

  it("looks back before the scope when the scope itself has no grade", () => {
    const b = blob({ attendance: { "t1|s1": { grade: "ST4" } } });
    expect(latestGrade(b, "t1", [sessions[1]])).toBe("ST4");
  });

  it("never looks forward past the end of the scope", () => {
    const b = blob({ attendance: { "t1|s3": { grade: "ST8" } } });
    expect(latestGrade(b, "t1", [sessions[0]])).toBe("");
  });

  it("is empty for a trainee who has never signed in with a grade", () => {
    expect(latestGrade(blob(), "t1")).toBe("");
    expect(latestGrade(blob(), "t1", sessions)).toBe("");
  });

  it("ignores a stored grade that is only whitespace", () => {
    const b = blob({
      trainees: [{ id: "t1", name: "Alice", grade: "   " }],
      attendance: { "t1|s2": { grade: "ST5" } },
    });
    expect(latestGrade(b, "t1")).toBe("ST5");
  });

  it("copes with an empty register", () => {
    expect(latestGrade({ ...EMPTY_REGISTER }, "t1")).toBe("");
  });
});
