import { useState } from "react";
import { CalendarPlus, Pencil, Trash2, UserPlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MonthInput } from "@/components/register/MonthInput";
import {
  newId, removeSession, removeStatus, removeTrainee, upsertSession, upsertStatus, upsertTrainee,
} from "@/lib/register/blob";
import { GRADES } from "@/lib/register/constants";
import { formatMonth, sessionsSorted } from "@/lib/register/months";
import type { RegisterEdit } from "@/hooks/useRegisterStore";
import type { RegisterBlob, RegisterStatus } from "@/lib/register/types";

const STATUS_TYPES: { value: RegisterStatus["type"]; label: string; hint: string }[] = [
  { value: "cct",     label: "CCT — completed training", hint: "Not counted after this month." },
  { value: "mat",     label: "Maternity / paternity leave", hint: "Not counted across the window." },
  { value: "oop",     label: "Out of programme", hint: "Not counted across the window." },
  { value: "idt_in",  label: "Transferred in (IDT)", hint: "Not counted before this month." },
  { value: "idt_out", label: "Transferred out (IDT)", hint: "Not counted from this month on." },
];

const NONE = "__none__";

export function ManagePanel({
  blob, onEdit, canEdit,
}: {
  blob: RegisterBlob;
  onEdit: (edit: RegisterEdit) => void;
  canEdit: boolean;
}) {
  const [trainee, setTrainee] = useState<{ id?: string; name: string; grade: string; email: string } | null>(null);
  const [session, setSession] = useState<{ id?: string; title: string; month: string } | null>(null);
  const [status, setStatus] = useState<Partial<RegisterStatus> | null>(null);
  const [confirm, setConfirm] = useState<{ label: string; detail: string; run: () => void } | null>(null);

  const sessions = sessionsSorted(blob.sessions);
  const nameOf = (id: string) => blob.trainees.find((t) => t.id === id)?.name ?? "Unknown";

  const saveTrainee = () => {
    if (!trainee?.name.trim()) return;
    onEdit((b) => upsertTrainee(b, {
      id: trainee.id ?? newId(),
      name: trainee.name.trim(),
      ...(trainee.grade ? { grade: trainee.grade } : {}),
      ...(trainee.email.trim() ? { email: trainee.email.trim() } : {}),
    }));
    setTrainee(null);
  };

  const saveSession = () => {
    if (!session?.title.trim() || !session.month) return;
    onEdit((b) => upsertSession(b, {
      id: session.id ?? newId(),
      title: session.title.trim(),
      month: session.month,
    }));
    setSession(null);
  };

  const saveStatus = () => {
    if (!status?.trainee || !status.type) return;
    onEdit((b) => upsertStatus(b, {
      id: status.id ?? newId(),
      trainee: status.trainee!,
      type: status.type!,
      start: status.start || null,
      end: status.end || null,
    }));
    setStatus(null);
  };

  return (
    <div className="space-y-10">
      {/* -------------------------------------------------------- trainees -- */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold">Trainees</h2>
            <p className="text-xs text-muted-foreground">
              {blob.trainees.length} on the roster
            </p>
          </div>
          {canEdit && (
            <Button
              size="sm"
              className="w-full sm:w-auto"
              onClick={() => setTrainee({ name: "", grade: "", email: "" })}
            >
              <UserPlus className="mr-1.5 h-4 w-4" /> Add trainee
            </Button>
          )}
        </div>

        {blob.trainees.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nobody on the roster yet.</p>
        ) : (
          <div className="divide-y rounded-lg border">
            {[...blob.trainees].sort((a, b) => a.name.localeCompare(b.name)).map((t) => (
              <div key={t.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{t.name}</p>
                  {t.email && <p className="truncate text-xs text-muted-foreground">{t.email}</p>}
                </div>
                {t.grade && <Badge variant="secondary" className="text-[10px]">{t.grade}</Badge>}
                {canEdit && (
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" className="h-7 w-7" aria-label={`Edit ${t.name}`}
                      onClick={() => setTrainee({ id: t.id, name: t.name, grade: t.grade ?? "", email: t.email ?? "" })}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" aria-label={`Remove ${t.name}`}
                      onClick={() => setConfirm({
                        label: `Remove ${t.name}?`,
                        detail: "Their attendance, excusals and long-term status go too. Nothing else is affected.",
                        run: () => onEdit((b) => removeTrainee(b, t.id)),
                      })}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* -------------------------------------------------------- sessions -- */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold">Teaching days</h2>
            <p className="text-xs text-muted-foreground">
              {sessions.length} recorded. The register year runs August to July.
            </p>
          </div>
          {canEdit && (
            <Button size="sm" className="w-full sm:w-auto"
              onClick={() => setSession({ title: "", month: "" })}>
              <CalendarPlus className="mr-1.5 h-4 w-4" /> Add teaching day
            </Button>
          )}
        </div>

        {sessions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No teaching days yet.</p>
        ) : (
          <div className="divide-y rounded-lg border">
            {sessions.map((s) => (
              <div key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{s.title}</p>
                  <p className="text-xs text-muted-foreground">{formatMonth(s.month, "en-GB")}</p>
                </div>
                {canEdit && (
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" className="h-7 w-7" aria-label={`Edit ${s.title}`}
                      onClick={() => setSession({ id: s.id, title: s.title, month: s.month })}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" aria-label={`Remove ${s.title}`}
                      onClick={() => setConfirm({
                        label: `Remove ${s.title}?`,
                        detail: "Every attendance mark and excusal for that day is removed with it.",
                        run: () => onEdit((b) => removeSession(b, s.id)),
                      })}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ---------------------------------------------------------- status -- */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold">Long-term status</h2>
            <p className="text-xs text-muted-foreground">
              Months outside a trainee's active window count towards neither attendance nor
              the total, so leave never reads as a poor record.
            </p>
          </div>
          {canEdit && (
            <Button size="sm" variant="outline" className="w-full sm:w-auto"
              onClick={() => setStatus({ type: "mat" })}>
              Add status
            </Button>
          )}
        </div>

        {blob.status.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing recorded.</p>
        ) : (
          <div className="divide-y rounded-lg border">
            {blob.status.map((s) => (
              <div key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{nameOf(s.trainee)}</p>
                  <p className="text-xs text-muted-foreground">
                    {STATUS_TYPES.find((t) => t.value === s.type)?.label ?? s.type}
                    {" · "}
                    {s.start ? formatMonth(s.start, "en-GB") : "open"}
                    {" – "}
                    {s.end ? formatMonth(s.end, "en-GB") : "open"}
                  </p>
                </div>
                {canEdit && (
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Edit status"
                      onClick={() => setStatus(s)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" aria-label="Remove status"
                      onClick={() => setConfirm({
                        label: "Remove this status?",
                        detail: `${nameOf(s.trainee)} becomes eligible for every teaching day again.`,
                        run: () => onEdit((b) => removeStatus(b, s.id)),
                      })}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* -------------------------------------------------- trainee dialog -- */}
      <Dialog open={!!trainee} onOpenChange={(o) => !o && setTrainee(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{trainee?.id ? "Edit trainee" : "Add trainee"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="t-name" className="text-xs">Name</Label>
              <Input id="t-name" value={trainee?.name ?? ""} autoFocus
                onChange={(e) => setTrainee((t) => t && { ...t, name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="t-grade" className="text-xs">Grade</Label>
              <Select value={trainee?.grade || NONE}
                onValueChange={(v) => setTrainee((t) => t && { ...t, grade: v === NONE ? "" : v })}>
                <SelectTrigger id="t-grade"><SelectValue placeholder="Not set" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Not set</SelectItem>
                  {GRADES.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                Whatever a trainee picks at their next sign-in replaces this — it changes
                between rotations.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="t-email" className="text-xs">
                Email <span className="text-muted-foreground">(for certificates)</span>
              </Label>
              <Input id="t-email" type="email" value={trainee?.email ?? ""}
                onChange={(e) => setTrainee((t) => t && { ...t, email: e.target.value })} />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setTrainee(null)}>Cancel</Button>
            <Button onClick={saveTrainee} disabled={!trainee?.name.trim()}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* -------------------------------------------------- session dialog -- */}
      <Dialog open={!!session} onOpenChange={(o) => !o && setSession(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{session?.id ? "Edit teaching day" : "Add teaching day"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="s-title" className="text-xs">Title</Label>
              <Input id="s-title" value={session?.title ?? ""} autoFocus
                placeholder="e.g. Paediatric ENT"
                onChange={(e) => setSession((s) => s && { ...s, title: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="s-month" className="text-xs">Month</Label>
              <MonthInput id="s-month" value={session?.month ?? ""}
                onChange={(m) => setSession((s) => s && { ...s, month: m })} />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setSession(null)}>Cancel</Button>
            <Button onClick={saveSession} disabled={!session?.title.trim() || !session?.month}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* --------------------------------------------------- status dialog -- */}
      <Dialog open={!!status} onOpenChange={(o) => !o && setStatus(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{status?.id ? "Edit status" : "Add status"}</DialogTitle>
            <DialogDescription>
              {STATUS_TYPES.find((t) => t.value === status?.type)?.hint}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="st-trainee" className="text-xs">Trainee</Label>
              <Select value={status?.trainee ?? ""}
                onValueChange={(v) => setStatus((s) => ({ ...s, trainee: v }))}>
                <SelectTrigger id="st-trainee"><SelectValue placeholder="Choose" /></SelectTrigger>
                <SelectContent>
                  {[...blob.trainees].sort((a, b) => a.name.localeCompare(b.name)).map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="st-type" className="text-xs">Type</Label>
              <Select value={status?.type ?? "mat"}
                onValueChange={(v) => setStatus((s) => ({ ...s, type: v as RegisterStatus["type"] }))}>
                <SelectTrigger id="st-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUS_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="st-start" className="text-xs">From</Label>
                <MonthInput id="st-start" value={status?.start ?? ""}
                  onChange={(m) => setStatus((s) => ({ ...s, start: m || null }))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="st-end" className="text-xs">To</Label>
                <MonthInput id="st-end" value={status?.end ?? ""}
                  onChange={(m) => setStatus((s) => ({ ...s, end: m || null }))} />
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Leave a month empty to leave that end open — a leave with no end date runs on
              indefinitely, and one with no start counts only after the return.
            </p>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setStatus(null)}>Cancel</Button>
            <Button onClick={saveStatus} disabled={!status?.trainee || !status?.type}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ------------------------------------------------------- confirm -- */}
      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm?.label}</AlertDialogTitle>
            <AlertDialogDescription>{confirm?.detail}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { confirm?.run(); setConfirm(null); }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
