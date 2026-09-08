import { useState } from "react";
import { CalendarPlus, ChevronDown, Pencil, Trash2, UserPlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MonthInput } from "@/components/register/MonthInput";
import {
  newId, removeSession, removeTrainee, upsertSession, upsertTrainee,
} from "@/lib/register/blob";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { activeStatusType, isFormerTrainee } from "@/lib/register/eligibility";
import { STATUS_SHORT, statusRangeText } from "@/lib/register/statusText";
import { GRADES } from "@/lib/register/constants";
import { formatMonth, sessionsSorted } from "@/lib/register/months";
import { cn } from "@/lib/utils";
import type { RegisterEdit } from "@/hooks/useRegisterStore";
import type { RegisterBlob, RegisterTrainee } from "@/lib/register/types";

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
  const [confirm, setConfirm] = useState<{ label: string; detail: string; run: () => void } | null>(null);
  const [showFormer, setShowFormer] = useState(false);

  const sessions = sessionsSorted(blob.sessions);

  // Somebody who has CCT'd or transferred out drops out of the working roster
  // and into the list below it. Nothing about their record changes — every past
  // year's figures still include them, which is the whole point.
  const byName = [...blob.trainees].sort((a, b) => a.name.localeCompare(b.name));
  const current = byName.filter((t) => !isFormerTrainee(blob, t.id));
  const former = byName.filter((t) => isFormerTrainee(blob, t.id));

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

  const row = (t: RegisterTrainee) => {
    const status = activeStatusType(blob, t.id);
    const departed = isFormerTrainee(blob, t.id);

    return (
      <div key={t.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{t.name}</p>
          {t.email
            ? <p className="truncate text-xs text-muted-foreground">{t.email}</p>
            : <p className="truncate text-xs text-muted-foreground/70">No email on file</p>}
        </div>

        {departed && status && (
          <Badge variant="outline" className="whitespace-nowrap text-[10px]"
                 title={statusRangeText(status)}>
            {STATUS_SHORT[status.type]}
            {(status.end || status.start) && ` · ${formatMonth(status.end || status.start, "en-GB")}`}
          </Badge>
        )}
        {t.grade && <Badge variant="secondary" className="text-[10px]">{t.grade}</Badge>}

        {canEdit && (
          <div className="flex gap-1">
            <Button size="icon" variant="ghost" className="h-7 w-7" aria-label={`Edit ${t.name}`}
              onClick={() => setTrainee({ id: t.id, name: t.name, grade: t.grade ?? "", email: t.email ?? "" })}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive"
              aria-label={`Remove ${t.name}`}
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
    );
  };

  return (
    <div className="space-y-10">
      {/* -------------------------------------------------------- trainees -- */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold">Trainees</h2>
            <p className="text-xs text-muted-foreground">
              {current.length} on the roster
              {former.length > 0 && ` · ${former.length} former`}
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
          <>
            {current.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Everybody on this register has completed training or transferred out —
                they are in the list below.
              </p>
            ) : (
              <div className="divide-y rounded-lg border">{current.map(row)}</div>
            )}

            {former.length > 0 && (
              <Collapsible open={showFormer} onOpenChange={setShowFormer} className="pt-1">
                <CollapsibleTrigger asChild>
                  <Button variant="outline" size="sm" className="w-full justify-between text-xs">
                    <span>
                      Former trainees (CCT'd or transferred out) · {former.length}
                    </span>
                    <ChevronDown
                      className={cn("h-4 w-4 transition-transform", showFormer && "rotate-180")}
                    />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2">
                  <div className="divide-y rounded-lg border opacity-80">{former.map(row)}</div>
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    They stay in every past year's figures. Change or clear the status on the
                    Long-term status tab to bring somebody back into the roster.
                  </p>
                </CollapsibleContent>
              </Collapsible>
            )}
          </>
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
