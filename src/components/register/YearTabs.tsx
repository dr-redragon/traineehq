import { YearChip } from "@/components/register/YearChip";
import { ALL_YEARS, academicYearRange } from "@/lib/register/months";

/**
 * The academic-year picker. The register year runs August to July, so a year is
 * a label like "2025/26" — never a calendar year.
 */
export function YearTabs({
  years, value, onChange,
}: {
  years: string[];
  value: string;
  onChange: (year: string) => void;
}) {
  if (!years.length) return null;

  return (
    <div className="flex flex-wrap gap-1.5">
      {years.map((year) => (
        <YearChip
          key={year}
          pressed={value === year}
          title={academicYearRange(year)}
          onClick={() => onChange(year)}
        >
          {year}
        </YearChip>
      ))}
      {years.length > 1 && (
        <YearChip
          pressed={value === ALL_YEARS}
          title="Every academic year at once"
          onClick={() => onChange(ALL_YEARS)}
        >
          All years
        </YearChip>
      )}
    </div>
  );
}
