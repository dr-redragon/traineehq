import { describe, expect, it } from "vitest";
import { STATUS_LABELS, STATUS_OPTIONS, statusRangeText } from "./statusText";
import type { RegisterStatus } from "./types";

const status = (o: Partial<RegisterStatus>): RegisterStatus => ({
  id: "s1", trainee: "t1", type: "mat", start: null, end: null, ...o,
});

describe("statusRangeText", () => {
  it("describes a CCT by its end, falling back to start", () => {
    expect(statusRangeText(status({ type: "cct", end: "2026-03" })))
      .toBe("completes after Mar 2026 (2025/26)");
    expect(statusRangeText(status({ type: "cct", start: "2026-03" })))
      .toBe("completes after Mar 2026 (2025/26)");
    expect(statusRangeText(status({ type: "cct" })))
      .toBe("completes (month not set)");
  });

  it("describes the transfers by their start, falling back to end", () => {
    expect(statusRangeText(status({ type: "idt_out", start: "2026-02" })))
      .toBe("leaves deanery from Feb 2026 (2025/26)");
    expect(statusRangeText(status({ type: "idt_out", end: "2026-02" })))
      .toBe("leaves deanery from Feb 2026 (2025/26)");
    expect(statusRangeText(status({ type: "idt_in", start: "2026-02" })))
      .toBe("joins deanery from Feb 2026 (2025/26)");
    expect(statusRangeText(status({ type: "idt_in" })))
      .toBe("joins deanery (month not set)");
  });

  describe.each(["mat", "oop"] as const)("%s reads as a window", (type) => {
    // en-GB abbreviates September as "Sept", not "Sep" — asserted rather than
    // worked around, so a change of locale or ICU shows up here.
    it("closed at both ends", () => {
      expect(statusRangeText(status({ type, start: "2025-09", end: "2026-03" })))
        .toBe("excluded Sept 2025 (2025/26) → Mar 2026 (2025/26)");
    });
    it("open at the end", () => {
      expect(statusRangeText(status({ type, start: "2025-09" })))
        .toBe("excluded from Sept 2025 (2025/26) → ongoing");
    });
    it("open at the start", () => {
      expect(statusRangeText(status({ type, end: "2026-03" })))
        .toBe("excluded up to Mar 2026 (2025/26), counts after");
    });
    it("open at both ends", () => {
      expect(statusRangeText(status({ type }))).toBe("excluded (no dates set) → ongoing");
    });
  });

  it("says plainly that active excludes nothing", () => {
    expect(statusRangeText(status({ type: "active" }))).toBe("counts for every teaching day");
  });

  it("names the academic year, not the calendar year", () => {
    // Aug and Jul sit either side of the register year boundary.
    expect(statusRangeText(status({ type: "cct", end: "2026-08" })))
      .toContain("(2026/27)");
    expect(statusRangeText(status({ type: "cct", end: "2026-07" })))
      .toContain("(2025/26)");
  });
});

describe("the label tables", () => {
  it("cover every status type", () => {
    const types: RegisterStatus["type"][] = ["active", "cct", "mat", "oop", "idt_in", "idt_out"];
    for (const t of types) {
      expect(STATUS_LABELS[t]).toBeTruthy();
      expect(STATUS_OPTIONS.find((o) => o.value === t)).toBeTruthy();
    }
    expect(STATUS_OPTIONS).toHaveLength(types.length);
  });
});
