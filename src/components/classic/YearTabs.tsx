import { ALL_YEARS, academicYearRange } from "@/lib/classic/months";
import type { RegisterSession } from "@/lib/classic/types";
import { academicYearOf } from "@/lib/classic/months";

/**
 * The pill row that picks an academic year, as `.yr-tabs` in the original.
 *
 * A register year runs August to July, so a calendar year would cut every
 * cohort in half. "All years" is offered first and only when there is more than
 * one year to pool.
 */
export function YearTabs({
  years,
  sessions,
  value,
  onChange,
}: {
  years: string[];
  sessions: RegisterSession[];
  value: string;
  onChange: (year: string) => void;
}) {
  if (years.length === 0) return null;

  const countIn = (year: string) =>
    sessions.filter((s) => academicYearOf(s.month) === year).length;

  return (
    <div className="yr-tabs">
      {years.length > 1 && (
        <button
          type="button"
          className={"yr-tab" + (value === ALL_YEARS ? " on" : "")}
          aria-pressed={value === ALL_YEARS}
          onClick={() => onChange(ALL_YEARS)}
        >
          All years<span className="cnt">{sessions.length}</span>
        </button>
      )}
      {years.map((year) => (
        <button
          key={year}
          type="button"
          className={"yr-tab" + (value === year ? " on" : "")}
          aria-pressed={value === year}
          title={academicYearRange(year)}
          onClick={() => onChange(year)}
        >
          {year}<span className="cnt">{countIn(year)}</span>
        </button>
      ))}
    </div>
  );
}
