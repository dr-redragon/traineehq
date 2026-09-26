import { ALL_YEARS, academicYearRange } from "@/lib/register/months";
import { cn } from "@/lib/utils";

/**
 * The academic-year picker. The register year runs August to July, so a year is
 * a label like "2025/26" — never a calendar year.
 *
 * Drawn as one ruled segmented control, the selected year filled with ink. A
 * filter is on or off, so each segment is a toggle button and says so with
 * `aria-pressed` — the state a screen reader and a test can read without a
 * colour, and which a phone's sticky :hover cannot fake.
 */
export function YearTabs({
  years, value, onChange,
}: {
  years: string[];
  value: string;
  onChange: (year: string) => void;
}) {
  if (!years.length) return null;

  const options: [string, string, string][] = years.map((y) => [y, y, academicYearRange(y)]);
  if (years.length > 1) options.push([ALL_YEARS, "All years", "Every academic year at once"]);

  return (
    <div className="inline-flex max-w-full flex-wrap border-2 border-foreground">
      {options.map(([key, label, title]) => {
        const pressed = value === key;
        return (
          <button
            key={key}
            type="button"
            aria-pressed={pressed}
            title={title}
            onClick={() => onChange(key)}
            className={cn(
              "h-8 select-none touch-manipulation px-3 text-[13px] transition-colors",
              pressed
                ? "bg-foreground font-bold text-background"
                : "font-normal text-foreground hover:bg-accent",
            )}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
