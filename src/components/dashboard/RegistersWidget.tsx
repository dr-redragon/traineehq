import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ClipboardList, Clock } from "lucide-react";
import { WidgetSection } from "@/components/dashboard/WidgetSection";
import { Skeleton } from "@/components/ui/skeleton";
import { useGroupedRegisters } from "@/hooks/useRegisters";

/**
 * The teaching registers this person can open, one click from the dashboard.
 *
 * A register is somewhere you go repeatedly — to mark a teaching day, to check
 * who is short of attendance — and reaching it meant the sidebar, then the
 * directory, then the right card. This is the same list, at the top of the
 * page somebody already has open.
 *
 * It reads the same directory query as the registers area, so opening one from
 * here finds the list already loaded rather than fetching it twice.
 */
export function RegistersWidget() {
  const { grouped, isLoading } = useGroupedRegisters();

  const section = (children: ReactNode, count?: number) => (
    <WidgetSection icon={ClipboardList} title="Teaching Registers" count={count}>
      {children}
    </WidgetSection>
  );

  if (isLoading) {
    return section(
      <div className="space-y-2">
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
      </div>,
    );
  }

  // Nobody's register yet. Say what is there to ask for rather than showing an
  // empty box: for most people this is the first they hear that registers exist.
  if (!grouped.mine.length) {
    return section(
      <div className="space-y-3">
        <p className="text-[13px] text-muted-foreground">
            {grouped.awaiting.length
              ? "Your request is with the people who run that register."
              : grouped.available.length
                ? `${grouped.available.length} ${grouped.available.length === 1 ? "register is" : "registers are"} open to request.`
                : "No registers have been set up yet."}
        </p>
        <Link
          to="/registers"
          className="inline-flex items-center gap-1 text-sm font-medium text-accent-700 underline underline-offset-[3px] hover:text-accent-800"
        >
          Open the register directory <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>,
    );
  }

  return section(
    <div>
      <div className="divide-y divide-border">
        {grouped.mine.map((entry) => (
          <Link
            key={entry.id}
            to={`/registers/${entry.slug}`}
            className="group flex items-center gap-3 px-1 py-2 transition-colors hover:bg-foreground/[0.04]"
          >
            <ClipboardList className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium transition-colors group-hover:text-rule">
                {entry.specialty_name}
              </p>
              <p className="truncate text-xs text-muted-foreground">{entry.deanery_name}</p>
            </div>
            <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
          </Link>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t-2 border-border pt-2">
        <Link
          to="/registers"
          className="text-xs font-medium text-accent-700 underline underline-offset-[3px] hover:text-accent-800"
        >
          All registers
        </Link>
        {grouped.awaiting.length > 0 && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            {grouped.awaiting.length} awaiting a decision
          </span>
        )}
      </div>
    </div>,
    grouped.mine.length,
  );
}
