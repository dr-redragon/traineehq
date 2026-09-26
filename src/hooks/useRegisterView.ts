import { useCallback, useMemo } from "react";
import { useUrlState } from "@/hooks/useUrlState";
import {
  ALL_YEARS, academicYearOf, availableAcademicYears, defaultAcademicYear,
  sessionsInYear, sessionsSorted,
} from "@/lib/register/months";
import type { RegisterSession } from "@/lib/register/types";

export type RegisterTabId = "attendance" | "day" | "people" | "access";

/** The parts of the People tab, each a sub-tab of its own. */
export type PeopleSectionId = "trainees" | "status" | "excused";

const PEOPLE_SECTIONS: PeopleSectionId[] = ["trainees", "status", "excused"];

/**
 * The parts of the Teaching day tab: the day being run (QR, check-in, live
 * list, feedback) and the list of teaching days itself. Kept as `?part=` —
 * `?section=` belongs to People.
 */
export type DaySectionId = "live" | "manage";

/** Old tab names that now open a particular part of People. */
const FORMER_SECTIONS: Record<string, PeopleSectionId> = {
  manage: "trainees", status: "status", excused: "excused",
};

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
  const rawTabId: RegisterTabId = (TABS as string[]).includes(rawTab)
    ? rawTab as RegisterTabId
    : FORMER_TABS[rawTab] ?? "attendance";
  const showReport = rawTabId === "attendance" && (params.get("view") === "report" || rawTab === "reports");

  const rawSection = params.get("section") ?? "";

  // Teaching days used to be managed from People; a link to that part now
  // opens it where it lives, on the Teaching day tab.
  const formerDays = rawTab === "people" && rawSection === "days";
  const tab: RegisterTabId = formerDays ? "day" : rawTabId;
  const daySection: DaySectionId = formerDays || params.get("part") === "manage" ? "manage" : "live";

  const section: PeopleSectionId = (PEOPLE_SECTIONS as string[]).includes(rawSection)
    ? rawSection as PeopleSectionId
    : FORMER_SECTIONS[rawTab] ?? "trainees";

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
  const setSection = useCallback(
    (next: PeopleSectionId) => patch({ tab: "people", section: next === "trainees" ? null : next }, { push: true }),
    [patch],
  );
  const setDaySection = useCallback(
    (next: DaySectionId) =>
      patch({ tab: "day", part: next === "live" ? null : next, section: null }, { push: true }),
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
  /** Pick a teaching day; name its year too when it may be outside the one shown. */
  const setDay = useCallback(
    (id: string, inYear?: string) => patch(inYear ? { day: id, year: inYear } : { day: id }),
    [patch],
  );

  /**
   * Open one teaching day on the Teaching day tab — the attendance grid's way
   * across. One navigation, so the tab and the day cannot land half-way.
   */
  const openDay = useCallback(
    (id: string, inYear?: string) =>
      patch(
        { tab: "day", part: null, view: null, day: id, ...(inYear ? { year: inYear } : {}) },
        { push: true },
      ),
    [patch],
  );

  return {
    tab, setTab, showReport, setShowReport, section, setSection, daySection, setDaySection,
    years, year, setYear, sessions, day, setDay, openDay,
  };
}

export type RegisterView = ReturnType<typeof useRegisterView>;
