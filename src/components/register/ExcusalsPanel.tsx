import { useMemo, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { YearTabs } from "@/components/register/YearTabs";
import { addExcusal, removeExcusal } from "@/lib/register/blob";
import { EXCUSAL_REASONS, OTHER_REASON } from "@/lib/register/constants";
import { ALL_YEARS, academicYearOf, sessionsSorted, sessionWhen } from "@/lib/register/months";
import type { RegisterEdit } from "@/hooks/useRegisterStore";
import type { RegisterView } from "@/hooks/useRegisterView";
import type { RegisterBlob, RegisterExcusal } from "@/lib/register/types";

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
 * the current year's excusals rather than every one ever recorded. The year and
 * the teaching day are the register's shared selection: the day picked on the
 * Teaching day tab is the one this form starts on, and picking one here
 * carries back there.
 */
export function ExcusalsPanel({
  blob, view, onEdit, canEdit,
}: {
  blob: RegisterBlob;
  view: RegisterView;
  onEdit: (edit: RegisterEdit) => void;
  canEdit: boolean;
}) {
  const { years, year: activeYear } = view;

  const [traineeId, setTraineeId] = useState("");
  const sessionId = view.day?.id ?? "";
  const [reason, setReason] = useState<string>(EXCUSAL_REASONS[0]);
  const [otherReason, setOtherReason] = useState("");
  const [editing, setEditing] = useState<RegisterExcusal | null>(null);

  const trainees = useMemo(
    () => [...blob.trainees].sort((a, b) => a.name.localeCompare(b.name)),
    [blob.trainees],
  );

  // Every teaching day, newest first: the form sits above the year chips, so it
  // offers any day rather than only the year the list below is showing. The day
  // being excused from is nearly always a recent one.
  const sessions = useMemo(() => [...sessionsSorted(blob.sessions)].reverse(), [blob.sessions]);

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
              <Select
                value={sessionId}
                onValueChange={(id) => {
                  // A day from another year brings that year into view with it.
                  const picked = blob.sessions.find((s) => s.id === id);
                  view.setDay(id, picked ? academicYearOf(picked.month) : undefined);
                }}
              >
                <SelectTrigger id="ex-session">
                  <SelectValue placeholder={sessions.length ? "Choose" : "None this year"} />
                </SelectTrigger>
                <SelectContent>
                  {sessions.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {sessionWhen(s)} · {s.title}
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

      <p className="max-w-2xl text-xs text-muted-foreground">
        Declared absences — leave, on-call, sickness, study leave — are removed from the
        denominator, so a missed but excused teaching day does not count against a trainee's
        adjusted attendance.
      </p>

      <YearTabs years={years} value={activeYear} onChange={view.setYear} />

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
                  {sessionWhen(session!)} · {session!.title}
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
                <div className="flex gap-1">
                <Button size="icon" variant="ghost" className="h-8 w-8"
                  aria-label={`Edit ${trainee!.name}'s excusal`} onClick={() => setEditing(excusal)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
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
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {editing && (
        <EditExcusalDialog
          excusal={editing}
          blob={blob}
          sessions={sessions}
          onClose={() => setEditing(null)}
          onSave={(updated) => {
            onEdit((b) => ({
              ...b,
              excused: b.excused.map((e) => (e.id === updated.id ? { ...e, ...updated } : e)),
            }));
            setEditing(null);
            toast.success("Excusal updated.");
          }}
        />
      )}
    </div>
  );
}

/** Change who an excusal is for, which day, or why — in a popup over the list. */
function EditExcusalDialog({
  excusal, blob, sessions, onClose, onSave,
}: {
  excusal: RegisterExcusal;
  blob: RegisterBlob;
  sessions: RegisterBlob["sessions"];
  onClose: () => void;
  onSave: (excusal: RegisterExcusal) => void;
}) {
  const listed = (EXCUSAL_REASONS as readonly string[]).includes(excusal.reason);
  const [traineeId, setTraineeId] = useState(excusal.trainee);
  const [sessionId, setSessionId] = useState(excusal.session);
  const [reason, setReason] = useState<string>(listed ? excusal.reason : OTHER_REASON);
  const [other, setOther] = useState(listed ? "" : excusal.reason);
  const finalReason = reason === OTHER_REASON ? other.trim() : reason;
  const trainees = [...blob.trainees].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Edit excusal</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="ex-edit-trainee" className="text-xs">Trainee</Label>
            <Select value={traineeId} onValueChange={setTraineeId}>
              <SelectTrigger id="ex-edit-trainee"><SelectValue /></SelectTrigger>
              <SelectContent>
                {trainees.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ex-edit-session" className="text-xs">Teaching day</Label>
            <Select value={sessionId} onValueChange={setSessionId}>
              <SelectTrigger id="ex-edit-session"><SelectValue /></SelectTrigger>
              <SelectContent>
                {sessions.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{sessionWhen(s)} · {s.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ex-edit-reason" className="text-xs">Reason</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger id="ex-edit-reason"><SelectValue /></SelectTrigger>
              <SelectContent>
                {EXCUSAL_REASONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {reason === OTHER_REASON && (
            <div className="space-y-1.5">
              <Label htmlFor="ex-edit-other" className="text-xs">Specify reason</Label>
              <Input id="ex-edit-other" value={other} onChange={(e) => setOther(e.target.value)} />
            </div>
          )}
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={!traineeId || !sessionId || !finalReason}
            onClick={() => onSave({ ...excusal, trainee: traineeId, session: sessionId, reason: finalReason })}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
