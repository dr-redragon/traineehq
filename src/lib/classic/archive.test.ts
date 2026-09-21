import { describe, expect, it } from "vitest";
import { archivedAgo, daysUntilPurge, purgeCountdown } from "./archive";

const NOW = new Date("2026-09-21T12:00:00Z");
const inDays = (days: number) =>
  new Date(NOW.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
const agoDays = (days: number) => inDays(-days);

describe("daysUntilPurge", () => {
  it("counts a whole fifteen-day window as fifteen", () => {
    expect(daysUntilPurge(inDays(15), NOW)).toBe(15);
  });

  it("still says fifteen an hour into the window", () => {
    // Rounded up: the first day is not spent until it is over.
    expect(daysUntilPurge(inDays(15 - 1 / 24), NOW)).toBe(15);
  });

  it("counts down a day at a time", () => {
    expect(daysUntilPurge(inDays(14), NOW)).toBe(14);
    expect(daysUntilPurge(inDays(1), NOW)).toBe(1);
  });

  it("is zero on and after the deadline, never negative", () => {
    expect(daysUntilPurge(inDays(0), NOW)).toBe(0);
    expect(daysUntilPurge(agoDays(3), NOW)).toBe(0);
  });

  it("is zero for a date it cannot read", () => {
    expect(daysUntilPurge("not a date", NOW)).toBe(0);
  });
});

describe("purgeCountdown", () => {
  it("names the days while there is more than one", () => {
    expect(purgeCountdown(inDays(15), NOW)).toBe("15 days left");
    expect(purgeCountdown(inDays(2), NOW)).toBe("2 days left");
  });

  it("calls out the last day rather than rounding it", () => {
    expect(purgeCountdown(inDays(0.5), NOW)).toBe("Less than a day left");
    expect(purgeCountdown(inDays(1 / 24), NOW)).toBe("Less than a day left");
  });

  it("says so once the deadline has passed", () => {
    expect(purgeCountdown(inDays(0), NOW)).toBe("Due to be deleted");
    expect(purgeCountdown(agoDays(1), NOW)).toBe("Due to be deleted");
  });

  it("agrees with the day count it is built from", () => {
    expect(purgeCountdown(inDays(1), NOW)).toBe("1 day left");
    expect(daysUntilPurge(inDays(1), NOW)).toBe(1);
  });
});

describe("archivedAgo", () => {
  it("does not pretend to precision in the first hour", () => {
    expect(archivedAgo(agoDays(10 / (24 * 60)), NOW)).toBe("in the last hour");
  });

  it("counts hours, then days", () => {
    expect(archivedAgo(agoDays(5 / 24), NOW)).toBe("5 hours ago");
    expect(archivedAgo(agoDays(1), NOW)).toBe("1 day ago");
    expect(archivedAgo(agoDays(9), NOW)).toBe("9 days ago");
  });

  it("falls back rather than printing NaN", () => {
    expect(archivedAgo("not a date", NOW)).toBe("recently");
  });
});
