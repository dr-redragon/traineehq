import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChaseAbsencesDialog } from "@/components/register/ChaseAbsencesDialog";
import { useLiveAttendanceSync } from "@/hooks/useLiveAttendanceSync";
import { isPresent } from "@/lib/register/attendance";
import { unexplainedAbsentees } from "@/lib/register/chase";
import { isEligible, isExcused, isUpcoming } from "@/lib/register/eligibility";
import { fetchFeedback, fetchSessionStatus } from "@/lib/register/liveApi";
import { sessionWhen, todayIso } from "@/lib/register/months";
import type { RegisterBlob, RegisterDirectoryEntry, RegisterSession } from "@/lib/register/types";

/**
 * One teaching day, opened from its column header on the attendance grid.
 *
 * The things an organiser looks at a column for — how many came, who missed it
 * without a reason, what the room thought of it — with the two actions that
 * follow from those: chase the absences, or go to the day itself. Deliberately
 * no "mark everyone present": a register that can be filled in with one press
 * is a register nobody can trust.
 *
 * Every figure is read from the same blob the grid draws, so the panel and the
 * column it belongs to cannot disagree.
 */
export function SessionSidePanel({
  blob, session, register, onOpenDay, onClose,
}: {
  blob: RegisterBlob;
  session: RegisterSession;
  /** Needed to chase absences and read feedback; without it those are left out. */
  register?: RegisterDirectoryEntry;
  onOpenDay: () => void;
  onClose: () => void;
}) {
  const [chasing, setChasing] = useState(false);
  const upcoming = isUpcoming(session, todayIso());

  const counts = useMemo(() => {
    let eligible = 0, attended = 0, excused = 0;
    for (const t of blob.trainees) {
      if (!isEligible(blob, t.id, session.month)) continue;
      eligible++;
      if (isPresent(blob, t.id, session.id)) attended++;
      else if (isExcused(blob, t.id, session.id)) excused++;
    }
    return { eligible, attended, excused };
  }, [blob, session]);

  const missed = useMemo(() => unexplainedAbsentees(blob, session, todayIso()), [blob, session]);

  // The published day, for its feedback and for the chaser, which is scoped to
  // it. Both queries share their keys with the Teaching day tab, so opening
  // this after that tab costs nothing.
  const { publishedFor } = useLiveAttendanceSync(register?.id, blob);
  const live = publishedFor(session.id);

  const { data: responses } = useQuery({
    queryKey: ["register-feedback", live?.id ?? ""],
    queryFn: () => fetchFeedback(live!.id),
    enabled: !!live?.id,
  });
  const { data: status } = useQuery({
    queryKey: ["register-session-status", live?.id],
    queryFn: () => fetchSessionStatus(live!.id),
    enabled: !!live?.id,
  });

  const rating = useMemo(() => {
    const scores = (responses ?? [])
      .map((r) => r.overall_rating)
      .filter((n): n is number => Number.isFinite(n as number));
    return scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : null;
  }, [responses]);

  const stats: [string, string][] = [
    ["Attended", upcoming ? "—" : `${counts.attended}/${counts.eligible}`],
    ["Excused", String(counts.excused)],
    ["Feedback", rating ?? "—"],
  ];

  const chaseBlocked = !register
    ? null
    : upcoming
      ? "This day has not happened yet."
      : !live
        ? "This day is not set up for check-in yet."
        : !missed.length
          ? "Nobody to chase."
          : null;

  return (
    <aside
      aria-label={`Teaching day: ${session.title}`}
      className="flex flex-col border-2 border-foreground bg-background xl:sticky xl:top-16"
    >
      <div className="flex items-start justify-between gap-3 border-b-2 border-foreground px-5 pb-4 pt-5">
        <div className="min-w-0 space-y-1.5">
          <p className="text-[11.5px] font-bold uppercase tracking-[0.14em] text-accent-deep">
            Selected day
          </p>
          <p className="font-display text-[28px] font-extrabold leading-none tracking-[-0.02em]">
            {sessionWhen(session)}
          </p>
          <p className="text-[13.5px]">{session.title}</p>
          {session.location && (
            <p className="text-[12.5px] text-muted-foreground">{session.location}</p>
          )}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="-mr-2 -mt-2 h-8 w-8 shrink-0 text-muted-foreground"
          aria-label="Close teaching day"
          onClick={onClose}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid grid-cols-3 border-b border-border">
        {stats.map(([label, value]) => (
          <div key={label} className="space-y-1 border-r border-border px-4 py-3 last:border-r-0">
            <p className="font-display text-[22px] font-extrabold leading-none tabular-nums">{value}</p>
            <p className="text-[10.5px] uppercase tracking-[0.1em] text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>

      <div className="flex-1 space-y-1 px-5 py-4">
        <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
          Missed without excusal
        </p>
        {upcoming ? (
          <p className="py-1.5 text-sm text-muted-foreground">Not held yet.</p>
        ) : missed.length ? (
          <ul>
            {missed.map((t) => (
              <li
                key={t.id}
                className="border-b border-border/60 py-1.5 text-[14px] font-semibold text-accent-deep last:border-b-0"
              >
                {t.name}
              </li>
            ))}
          </ul>
        ) : (
          <p className="py-1.5 text-sm text-muted-foreground">Nobody — full house.</p>
        )}
      </div>

      <div className="space-y-2 border-t-2 border-foreground px-5 pb-5 pt-4">
        {register && (
          <Button
            type="button"
            className="w-full justify-start"
            disabled={!!chaseBlocked}
            title={chaseBlocked ?? undefined}
            onClick={() => setChasing(true)}
          >
            <Send className="mr-1.5 h-4 w-4" /> Chase absences
          </Button>
        )}
        <Button type="button" variant="outline" className="w-full justify-start" onClick={onOpenDay}>
          Open teaching day <ArrowRight className="ml-auto h-4 w-4" />
        </Button>
      </div>

      {register && live && (
        <ChaseAbsencesDialog
          open={chasing}
          onOpenChange={setChasing}
          blob={blob}
          session={session}
          liveSessionId={live.id}
          registerId={register.id}
          registerName={register.name}
          sandboxFrom={status?.email_sandbox ? status.email_from : null}
        />
      )}
    </aside>
  );
}
