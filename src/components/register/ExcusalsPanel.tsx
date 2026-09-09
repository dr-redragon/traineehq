import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { YearTabs } from "@/components/register/YearTabs";
import { addExcusal, removeExcusal } from "@/lib/register/blob";
import { EXCUSAL_REASONS, OTHER_REASON } from "@/lib/register/constants";
import {
  ALL_YEARS, academicYearOf, availableAcademicYears, defaultAcademicYear,
  formatMonth, sessionsInYear, sessionsSorted,
} from "@/lib/register/months";
import type { RegisterEdit } from "@/hooks/useRegisterStore";
import type { RegisterBlob } from "@/lib/register/types";

/**
 * Excused absences.
 *
 * Its own panel, as in the original, because an excusal is the other half of the
 * adjusted percentage: a missed teaching day counts against a trainee, an
 * excused one is removed from the denominator entirely. Logging one is the
 * commonest thing an organiser does between teaching days, and it needs to be
 * reachable without hunting through the roster.
 *
 * Scoped to an academic year like every other year-aware view, so the list is
 * the current year's excusals rather than every one ever recorded.
 */
export function ExcusalsPanel({
  blob, onEdit, canEdit,
}: {
  blob: RegisterBlob;
  onEdit: (edit: RegisterEdit) => void;
  canEdit: boolean;
}) {
  const years = useMemo(() => availableAcademicYears(blob.sessions), [blob.sessions]);
  const [year, setYear] = useState<string | null>(null);
  const activeYear = year ?? defaultAcademicYear(blob.sessions);

  const [traineeId, setTraineeId] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [reason, setReason] = useState<string>(EXCUSAL_REASONS[0]);
  const [otherReason, setOtherReason] = useState("");

  const trainees = useMemo(
    () => [...blob.trainees].sort((a, b) => a.name.localeCompare(b.name)),
    [blob.trainees],
  );

  // Newest first, as in the original — an organiser is nearly always looking for
  // something they logged recently.
  const sessions = useMemo(() => {
    const list = activeYear === ALL_YEARS
      ? sessionsSorted(blob.sessions)
      : sessionsInYear(blob.sessions, activeYear);
    return [...list].reverse();
  }, [blob.sessions, activeYear]);

  const excusals = useMemo(() => {
    const bySession = new Map(blob.sessions.map((s) => [s.id, s]));
    return blob.excused
      .map((e) => ({ excusal: e, session: bySession.get(e.session), trainee: blob.trainees.find((t) => t.id === e.trainee) }))
      // An excusal whose session or trainee has since been deleted has nothing
      // to show and no longer affects any figure; it is simply skipped.
      .filter((row) => !!row.session && !!row.trainee)
      .filter((row) => activeYear === ALL_YEARS
        || academicYearOf(row.session!.month) === activeYear)
      .sort((a, b) => Number(b.excusal.ts) - Number(a.excusal.ts));
  }, [blob.excused, blob.sessions, blob.trainees, activeYear]);

  const finalReason = reason === OTHER_REASON ? otherReason.trim() : reason;

  const add = () => {
    if (!traineeId || !sessionId) return;
    if (reason === OTHER_REASON && !finalReason) {
      toast.error("Give a reason, or choose one from the list.");
      return;
    }
    onEdit((b) => addExcusal(b, traineeId, sessionId, finalReason));
    toast.success("Excusal added — that day is out of their denominator.");
    setTraineeId("");
    setOtherReason("");
  };

  if (!blob.sessions.length) {
    return (
      <p className="text-sm text-muted-foreground">
        Add a teaching day first — an excusal is always from a particular day.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <p className="max-w-2xl text-sm text-muted-foreground">
        Declared absences — leave, on-call, sickness, study leave — are removed from the
        denominator, so a missed but excused teaching day does not count against a trainee's
        adjusted attendance.
      </p>

      <YearTabs years={years} value={activeYear} onChange={setYear} />

      {canEdit && (
        <Card>
          <CardContent className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <Label htmlFor="ex-trainee" className="text-xs">Trainee</Label>
              <Select value={traineeId} onValueChange={setTraineeId}>
                <SelectTrigger id="ex-trainee"><SelectValue placeholder="Choose" /></SelectTrigger>
                <SelectContent>
                  {trainees.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ex-session" className="text-xs">Teaching day</Label>
              <Select value={sessionId} onValueChange={setSessionId}>
                <SelectTrigger id="ex-session">
                  <SelectValue placeholder={sessions.length ? "Choose" : "None this year"} />
                </SelectTrigger>
                <SelectContent>
                  {sessions.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {formatMonth(s.month, "en-GB")} · {s.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ex-reason" className="text-xs">Reason</Label>
              <Select value={reason} onValueChange={setReason}>
                <SelectTrigger id="ex-reason"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {EXCUSAL_REASONS.map((r) => (
                    <SelectItem key={r} value={r}>{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-end">
              <Button
                className="w-full"
                onClick={add}
                disabled={!traineeId || !sessionId}
              >
                <Plus className="mr-1.5 h-4 w-4" /> Add excusal
              </Button>
            </div>

            {reason === OTHER_REASON && (
              <div className="space-y-1.5 sm:col-span-2 lg:col-span-4">
                <Label htmlFor="ex-other" className="text-xs">Specify reason</Label>
                <Input
                  id="ex-other"
                  value={otherReason}
                  onChange={(e) => setOtherReason(e.target.value)}
                  placeholder="e.g. Attending a funeral"
                />
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {excusals.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {blob.excused.length
            ? "No excused absences in this academic year."
            : "No excused absences logged."}
        </p>
      ) : (
        <div className="divide-y rounded-lg border">
          {excusals.map(({ excusal, session, trainee }) => (
            <div key={excusal.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{trainee!.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {formatMonth(session!.month, "en-GB")} · {session!.title}
                </p>
                {/* The reason gets a line of its own, and wraps. Appended to the
                    line above it was the first thing a narrow screen truncated
                    away — which left the one field somebody opens this tab to
                    read invisible on a phone. */}
                {excusal.reason && (
                  <p className="mt-0.5 break-words text-xs text-foreground/80">
                    {excusal.reason}
                  </p>
                )}
              </div>
              {canEdit && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  onClick={() => {
                    onEdit((b) => removeExcusal(b, excusal.id));
                    toast.success("Excusal removed — that day counts again.");
                  }}
                >
                  <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Remove
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
