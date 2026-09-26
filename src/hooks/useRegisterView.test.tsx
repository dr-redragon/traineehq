import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { useRegisterView } from "./useRegisterView";
import { useClassicRegisterView } from "./classic/useRegisterView";
import { ALL_YEARS } from "@/lib/register/months";

/*
 * The register's place — tab, academic year, teaching day — lives in the query
 * string. Pinned here: old tab names still land somewhere, a stale day or year
 * falls back to a fresh visit's defaults, and the day picked is shared.
 */

const sessions = [
  { id: "a", month: "2024-10", title: "Otology" },
  { id: "b", month: "2025-03", title: "Rhinology" },
  { id: "c", month: "2025-09", title: "Airway" },
  { id: "d", month: "2026-01", title: "Skull base" },
];

function setup<T>(hook: () => T, url: string) {
  let search = "";
  const Probe = () => { search = useLocation().search; return null; };
  const wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[url]}>{children}<Probe /></MemoryRouter>
  );
  const { result } = renderHook(hook, { wrapper });
  return { result, search: () => search };
}

describe("useRegisterView", () => {
  const useView = () => useRegisterView(sessions);

  it("opens on attendance, the latest year and its latest day", () => {
    const { result } = setup(useView, "/registers/x");
    expect(result.current.tab).toBe("attendance");
    expect(result.current.year).toBe("2025/26");
    expect(result.current.day?.id).toBe("d");
  });

  it("sends the old tab names to the tab that now holds them", () => {
    expect(setup(useView, "/r?tab=checkin").result.current.tab).toBe("day");
    expect(setup(useView, "/r?tab=excused").result.current.tab).toBe("people");
    expect(setup(useView, "/r?tab=nonsense").result.current.tab).toBe("attendance");
    const reports = setup(useView, "/r?tab=reports").result.current;
    expect(reports.tab).toBe("attendance");
    expect(reports.showReport).toBe(true);
  });

  it("takes the year from a linked day, and ignores a day that no longer exists", () => {
    expect(setup(useView, "/r?day=b").result.current.year).toBe("2024/25");
    expect(setup(useView, "/r?day=b").result.current.day?.id).toBe("b");
    expect(setup(useView, "/r?day=gone").result.current.day?.id).toBe("d");
    expect(setup(useView, "/r?year=1999/00").result.current.year).toBe("2025/26");
  });

  it("writes the tab and day to the address, and a new year clears the day", () => {
    const { result, search } = setup(useView, "/r");
    act(() => result.current.setTab("day"));
    act(() => result.current.setDay("c"));
    expect(new URLSearchParams(search()).get("tab")).toBe("day");
    expect(result.current.day?.id).toBe("c");
    act(() => result.current.setYear(ALL_YEARS));
    expect(new URLSearchParams(search()).get("day")).toBeNull();
    expect(result.current.sessions).toHaveLength(4);
  });
});

describe("useRegisterView — People sub-tabs", () => {
  const useView = () => useRegisterView(sessions);

  it("opens People on Trainees, and old tab names on their own part", () => {
    expect(setup(useView, "/r?tab=people").result.current.section).toBe("trainees");
    expect(setup(useView, "/r?tab=status").result.current).toMatchObject({ tab: "people", section: "status" });
    expect(setup(useView, "/r?tab=excused").result.current.section).toBe("excused");
  });

  it("keeps the part in the address", () => {
    const { result, search } = setup(useView, "/r");
    act(() => result.current.setSection("status"));
    const params = new URLSearchParams(search());
    expect(params.get("tab")).toBe("people");
    expect(params.get("section")).toBe("status");
  });

  it("picks a day in another year and shows that year", () => {
    const { result } = setup(useView, "/r?year=2025/26");
    act(() => result.current.setDay("a", "2024/25"));
    expect(result.current).toMatchObject({ year: "2024/25" });
    expect(result.current.day?.id).toBe("a");
  });
});

describe("useRegisterView — Teaching day sub-tabs", () => {
  const useView = () => useRegisterView(sessions);

  it("opens the Teaching day tab on the live day", () => {
    expect(setup(useView, "/r?tab=day").result.current.daySection).toBe("live");
  });

  it("keeps Manage days in the address", () => {
    const { result, search } = setup(useView, "/r");
    act(() => result.current.setDaySection("manage"));
    const params = new URLSearchParams(search());
    expect(params.get("tab")).toBe("day");
    expect(params.get("part")).toBe("manage");
    expect(result.current.daySection).toBe("manage");
  });

  it("sends an old link to People's teaching days to Manage days", () => {
    expect(setup(useView, "/r?tab=people&section=days").result.current)
      .toMatchObject({ tab: "day", daySection: "manage" });
  });

  it("opens a day from the grid on the live day, even from Manage days", () => {
    const { result } = setup(useView, "/r?tab=day&part=manage");
    act(() => result.current.openDay("c"));
    expect(result.current).toMatchObject({ tab: "day", daySection: "live" });
    expect(result.current.day?.id).toBe("c");
  });
});

describe("useClassicRegisterView", () => {
  it("only opens a tab this person is allowed", () => {
    const useHook = () => useClassicRegisterView(sessions, ["attendance", "checkin"]);
    expect(setup(useHook, "/c?tab=checkin").result.current.tab).toBe("checkin");
    expect(setup(useHook, "/c?tab=access").result.current.tab).toBe("attendance");
  });

  it("shares a valid day and drops a stale one", () => {
    const useHook = () => useClassicRegisterView(sessions);
    expect(setup(useHook, "/c?day=a").result.current).toMatchObject({ dayId: "a", year: "2024/25" });
    expect(setup(useHook, "/c?day=gone").result.current.dayId).toBe("");
  });
});
