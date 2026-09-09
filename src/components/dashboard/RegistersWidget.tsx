import { Link } from "react-router-dom";
import { ArrowRight, ClipboardList, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

  const header = (count?: number) => (
    <CardHeader className="pb-3">
      <CardTitle className="flex items-center gap-2 text-sm font-semibold">
        <ClipboardList className="h-4 w-4 text-primary" />
        Teaching Registers
        {!!count && <Badge variant="secondary" className="ml-auto text-[10px]">{count}</Badge>}
      </CardTitle>
    </CardHeader>
  );

  if (isLoading) {
    return (
      <Card>
        {header()}
        <CardContent className="space-y-2">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </CardContent>
      </Card>
    );
  }

  // Nobody's register yet. Say what is there to ask for rather than showing an
  // empty box: for most people this is the first they hear that registers exist.
  if (!grouped.mine.length) {
    return (
      <Card>
        {header()}
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {grouped.awaiting.length
              ? "Your request is with the people who run that register."
              : grouped.available.length
                ? `${grouped.available.length} ${grouped.available.length === 1 ? "register is" : "registers are"} open to request.`
                : "No registers have been set up yet."}
          </p>
          <Link
            to="/registers"
            className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            Open the register directory <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      {header(grouped.mine.length)}
      <CardContent className="space-y-2">
        {grouped.mine.map((entry) => (
          <Link
            key={entry.id}
            to={`/registers/${entry.slug}`}
            className="group flex items-center gap-3 rounded-md p-2 transition-colors hover:bg-secondary/50"
          >
            <ClipboardList className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium transition-colors group-hover:text-primary">
                {entry.specialty_name}
              </p>
              <p className="truncate text-xs text-muted-foreground">{entry.deanery_name}</p>
            </div>
            <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
          </Link>
        ))}

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1">
          <Link to="/registers" className="text-xs font-medium text-primary hover:underline">
            All registers
          </Link>
          {grouped.awaiting.length > 0 && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              {grouped.awaiting.length} awaiting a decision
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
