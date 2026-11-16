import { cn } from "@/lib/utils";

/**
 * The sub-tabs inside a register tab — People's parts, the Teaching day's live
 * day and its list of days.
 *
 * The same ruled segmented control as the academic-year picker (YearTabs), so
 * the register has one look for "pick one of these". A count, where given,
 * sits after the label.
 */
export function SubTabs<T extends string>({
  label, items, value, onChange,
}: {
  /** The accessible name of the tab list. */
  label: string;
  items: { id: T; label: string; count?: number }[];
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className="inline-flex max-w-full flex-wrap border-2 border-foreground"
    >
      {items.map((item) => {
        const on = value === item.id;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(item.id)}
            className={cn(
              "inline-flex h-8 select-none touch-manipulation items-center gap-1.5 px-3 text-[13px] transition-colors",
              on
                ? "bg-foreground font-bold text-background"
                : "font-normal text-foreground hover:bg-accent",
            )}
          >
            {item.label}
            {item.count !== undefined && (
              <span className={cn("tabular-nums", on ? "opacity-70" : "text-muted-foreground")}>
                {item.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
