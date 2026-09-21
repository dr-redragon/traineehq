import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * One section of the dashboard.
 *
 * The widgets used to be cards — each one a rounded, outlined box sitting on
 * the page, which on a dashboard of eight of them read as a pile of boxes
 * rather than as a page with parts. Modernist organises by alignment and the
 * strength of its dividers instead: a widget is now a ruled section, opened by
 * a 2px rule with its title flush left on it, and its contents run edge to edge
 * underneath. Nothing is outlined and nothing floats, so what the eye picks up
 * is the rhythm of the rules down the page.
 *
 * The count moves to the right of the rule as a kicker rather than sitting in a
 * badge beside the title: it is a label on the section, not a tag on a thing.
 */
export function WidgetSection({
  icon: Icon,
  title,
  count,
  action,
  children,
  className,
}: {
  icon: LucideIcon;
  title: string;
  /** Omitted rather than zero when there is nothing to count. */
  count?: number;
  /** A control belonging to the section — sits at the end of the header row. */
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("border-t-2 border-border pt-3", className)}>
      <header className="mb-3 flex items-center gap-2">
        <Icon className="h-4 w-4 shrink-0 text-rule" aria-hidden />
        <h2 className="font-display text-lg font-extrabold leading-tight tracking-tight">{title}</h2>
        {count !== undefined && (
          <span className="ds-kicker ml-auto tabular-nums">{count}</span>
        )}
        {action && <div className={cn("flex items-center", count === undefined && "ml-auto")}>{action}</div>}
      </header>
      {children}
    </section>
  );
}

/**
 * What a section shows when it has nothing to show.
 *
 * Flush left like everything else — a centred line of italic grey in an
 * otherwise left-aligned page is the kind of decoration the system drops.
 */
export function WidgetEmpty({ children }: { children: ReactNode }) {
  return <p className="py-3 text-[13px] text-muted-foreground">{children}</p>;
}

/**
 * What a section shows while its rows are still on their way.
 *
 * Not the same thing as WidgetEmpty, and that was the bug: a widget whose
 * query had not resolved rendered "No specialties assigned yet. Contact your
 * administrator." — a statement of fact about an account, shown for as long as
 * the request took. On a slow connection the dashboard spent several seconds
 * telling a trainee with six specialties that they had none. Ruled bars say
 * "loading" without asserting anything.
 */
export function WidgetSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div role="status">
      <span className="sr-only">Loading…</span>
      <div className="divide-y divide-border" aria-hidden>
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center gap-4 px-1 py-2.5">
            <Skeleton className="h-5 w-5 shrink-0" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-1/3" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
