import { useCallback, useMemo } from "react";
import { useUrlState } from "@/hooks/useUrlState";
import {
  ALL_YEARS, academicYearOf, availableAcademicYears, defaultAcademicYear,
  sessionsInYear, sessionsSorted,
} from "@/lib/register/months";
import type { RegisterSession } from "@/lib/register/types";

export type RegisterTabId = "attendance" | "day" | "people" | "access";

const TABS: RegisterTabId[] = ["attendance", "day", "people", "access"];

/**
 * The tab names this register used before its tabs were regrouped, and where
 * each now lives — so a bookmark to `?tab=checkin` still opens the right place.
 */
const FORMER_TABS: Record<string, RegisterTabId> = {
  manage: "people",
  status: "people",
  excused: "people",
  checkin: "day",
  feedback: "day",
  reports: "attendance",
};

/**
 * Where a person is inside one teaching register, read from and written to the
 * address bar.
 *
 *   ?tab=day&year=2025/26&day=<session id>
 *
 * The year and the teaching day are shared by every tab: most work is about
 * one teaching day, so picking it once on the attendance grid, the teaching
 * day and the excusal form means it stays picked when moving between them.
 *
 * Nothing here is trusted: a year with no sessions, or a day that has been
 * deleted, falls back to the same defaults a fresh visit gets.
 */
export function useRegisterView(allSessions: RegisterSession[]) {
  const { params, patch } = useUrlState();

  const rawTab = params.get("tab") ?? "";
  const tab: RegisterTabId = (TABS as string[]).includes(rawTab)
    ? rawTab as RegisterTabId
    : FORMER_TABS[rawTab] ?? "attendance";
  const showReport = tab === "attendance" && (params.get("view") === "report" || rawTab === "reports");

  const years = useMemo(() => availableAcademicYears(allSessions), [allSessions]);

  const rawDay = params.get("day");
  const pickedDay = allSessions.find((s) => s.id === rawDay);

  const rawYear = params.get("year");
  const year = rawYear === ALL_YEARS && years.length > 1
    ? ALL_YEARS
    : rawYear && years.includes(rawYear)
      ? rawYear
      : pickedDay
        ? academicYearOf(pickedDay.month)
        : defaultAcademicYear(allSessions);

  const sessions = useMemo(
    () => (year === ALL_YEARS ? sessionsSorted(allSessions) : sessionsInYear(allSessions, year)),
    [allSessions, year],
  );

  // The picked day if it is in scope, otherwise the latest one in scope —
  // the teaching day most likely to be the one being run.
  const day = sessions.find((s) => s.id === rawDay) ?? sessions[sessions.length - 1];

  const setTab = useCallback(
    (next: RegisterTabId) => patch({ tab: next === "attendance" ? null : next, view: null }, { push: true }),
    [patch],
  );
  const setShowReport = useCallback(
    (on: boolean) => patch({ tab: null, view: on ? "report" : null }, { push: true }),
    [patch],
  );
  const setYear = useCallback(
    (next: string) => patch({ year: next, day: null }),
    [patch],
  );
  const setDay = useCallback(
    (id: string) => patch({ day: id }),
    [patch],
  );

  return {
    tab, setTab, showReport, setShowReport,
    years, year, setYear, sessions, day, setDay,
  };
}

export type RegisterView = ReturnType<typeof useRegisterView>;
