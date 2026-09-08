import { Button } from "@/components/ui/button";
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
        <Button
          key={year}
          size="sm"
          variant={value === year ? "default" : "outline"}
          className="h-7 px-2.5 text-xs"
          title={academicYearRange(year)}
          onClick={() => onChange(year)}
        >
          {year}
        </Button>
      ))}
      {years.length > 1 && (
        <Button
          size="sm"
          variant={value === ALL_YEARS ? "default" : "outline"}
          className="h-7 px-2.5 text-xs"
          title="Every academic year at once"
          onClick={() => onChange(ALL_YEARS)}
        >
          All years
        </Button>
      )}
    </div>
  );
}
