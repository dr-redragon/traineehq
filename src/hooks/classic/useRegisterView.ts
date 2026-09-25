import { useCallback, useMemo } from "react";
import { useUrlState } from "@/hooks/useUrlState";
import {
  ALL_YEARS, academicYearOf, availableAcademicYears, defaultAcademicYear,
} from "@/lib/classic/months";
import type { RegisterSession } from "@/lib/classic/types";

export type ClassicTabId = "attendance" | "checkin" | "excused" | "status" | "manage" | "access";

const TABS: ClassicTabId[] = ["attendance", "checkin", "excused", "status", "manage", "access"];

/**
 * Where a person is inside one classic register, read from and written to the
 * address bar:
 *
 *   ?tab=checkin&year=2025/26&day=<session id>
 *
 * The year and the teaching day are shared by Attendance, Check-in and Excused
 * absences, so the day picked on one is still picked on the next, and all of
 * it survives a refresh, the Back button and a pasted link. Anything stale —
 * a year with no sessions, a deleted day, a tab this person cannot see — falls
 * back to what a fresh visit gets.
 */
export function useClassicRegisterView(sessions: RegisterSession[], allowedTabs: ClassicTabId[] = TABS) {
  const { params, patch } = useUrlState();

  const rawTab = params.get("tab") as ClassicTabId | null;
  const tab: ClassicTabId = rawTab && allowedTabs.includes(rawTab) ? rawTab : "attendance";

  const years = useMemo(() => availableAcademicYears(sessions), [sessions]);
  const rawDay = params.get("day") ?? "";
  const pickedDay = sessions.find((s) => s.id === rawDay);

  const rawYear = params.get("year");
  const year = rawYear === ALL_YEARS && years.length > 1
    ? ALL_YEARS
    : rawYear && years.includes(rawYear)
      ? rawYear
      : pickedDay
        ? academicYearOf(pickedDay.month)
        : defaultAcademicYear(sessions);

  const setTab = useCallback(
    (next: string) => patch({ tab: next === "attendance" ? null : next }, { push: true }),
    [patch],
  );
  const setYear = useCallback((next: string) => patch({ year: next, day: null }), [patch]);
  const setDay = useCallback((id: string) => patch({ day: id || null }), [patch]);

  return { tab, setTab, year, setYear, dayId: pickedDay ? rawDay : "", setDay };
}

export type ClassicRegisterView = ReturnType<typeof useClassicRegisterView>;
