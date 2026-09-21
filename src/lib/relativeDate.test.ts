import { describe, it, expect, vi, afterEach } from "vitest";

import { formatRelativeCompact } from "./relativeDate";

const NOW = new Date("2026-09-21T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

describe("formatRelativeCompact", () => {
  afterEach(() => vi.useRealTimers());

  it("returns an em dash for a missing or malformed date", () => {
    expect(formatRelativeCompact(null)).toBe("—");
    expect(formatRelativeCompact(undefined)).toBe("—");
    expect(formatRelativeCompact("not a date")).toBe("—");
  });

  it("labels today and yesterday by name, not a count", () => {
    vi.useFakeTimers().setSystemTime(NOW);
    expect(formatRelativeCompact(daysAgo(0))).toBe("Today");
    expect(formatRelativeCompact(daysAgo(1))).toBe("Yest.");
  });

  it("counts in days under a week, abbreviated", () => {
    vi.useFakeTimers().setSystemTime(NOW);
    expect(formatRelativeCompact(daysAgo(3))).toBe("3d ago");
    expect(formatRelativeCompact(daysAgo(6))).toBe("6d ago");
  });

  it("counts in weeks under a month, abbreviated", () => {
    vi.useFakeTimers().setSystemTime(NOW);
    expect(formatRelativeCompact(daysAgo(7))).toBe("1w ago");
    expect(formatRelativeCompact(daysAgo(20))).toBe("2w ago");
    expect(formatRelativeCompact(daysAgo(30))).toBe("4w ago");
  });

  it("falls back to month and year once it is more than a month old", () => {
    vi.useFakeTimers().setSystemTime(NOW);
    expect(formatRelativeCompact(daysAgo(31))).toBe("Aug 2026");
  });

  it("treats a future timestamp as today rather than a negative count", () => {
    vi.useFakeTimers().setSystemTime(NOW);
    expect(formatRelativeCompact(new Date(NOW.getTime() + 3_600_000).toISOString())).toBe("Today");
  });
});
