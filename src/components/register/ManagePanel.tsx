import { useState } from "react";
import { ChevronDown, MapPin, Pencil, Trash2, UserPlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { TeachingDayForm } from "@/components/register/TeachingDayForm";
import { sessionFromDraft } from "@/lib/register/teachingDay";
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
import {
  newId, removeSession, removeTrainee, upsertSession, upsertTrainee,
} from "@/lib/register/blob";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { activeStatusType, isFormerTrainee } from "@/lib/register/eligibility";
import { STATUS_SHORT, statusRangeText } from "@/lib/register/statusText";
import { GRADES } from "@/lib/register/constants";
import { formatMonth, sessionsSorted, sessionWhen } from "@/lib/register/months";
import { cn } from "@/lib/utils";
import type { RegisterEdit } from "@/hooks/useRegisterStore";
import type { RegisterBlob, RegisterSession, RegisterTrainee } from "@/lib/register/types";

const NONE = "__none__";

/**
 * The roster or the teaching days — one of the People tab's parts.
 *
 * The form to add to the list sits at the top of it, always open: adding a
 * trainee or a teaching day is the commonest thing done here, so it should not
 * be behind a button. Editing an existing row still opens a dialog.
 */
export function ManagePanel({
  blob, onEdit, canEdit, part,
}: {
  blob: RegisterBlob;
  onEdit: (edit: RegisterEdit) => void;
  canEdit: boolean;
  part: "trainees" | "days";
}) {
  const [trainee, setTrainee] = useState<{ id?: string; name: string; grade: string; email: string } | null>(null);
  const [adding, setAdding] = useState({ name: "", grade: "", email: "" });
  const [session, setSession] = useState<RegisterSession | null>(null);
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

  const addTrainee = (e: React.FormEvent) => {
    e.preventDefault();
    if (!adding.name.trim()) return;
    onEdit((b) => upsertTrainee(b, {
      id: newId(),
      name: adding.name.trim(),
      ...(adding.grade ? { grade: adding.grade } : {}),
      ...(adding.email.trim() ? { email: adding.email.trim() } : {}),
    }));
    setAdding({ name: "", grade: "", email: "" });
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
      {part === "trainees" && (
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold">Trainees</h2>
            <p className="text-xs text-muted-foreground">
              {current.length} on the roster
              {former.length > 0 && ` · ${former.length} former`}
            </p>
          </div>
        </div>

        {canEdit && (
          <Card>
            <CardContent className="p-4">
              <form onSubmit={addTrainee} className="grid gap-3 sm:grid-cols-[1.4fr,0.7fr,1.3fr,auto] sm:items-end">
                <div className="space-y-1.5">
                  <Label htmlFor="add-t-name" className="text-xs">Name</Label>
                  <Input id="add-t-name" value={adding.name} placeholder="Full name"
                    onChange={(e) => setAdding((a) => ({ ...a, name: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="add-t-grade" className="text-xs">Grade</Label>
                  <Select value={adding.grade || NONE}
                    onValueChange={(v) => setAdding((a) => ({ ...a, grade: v === NONE ? "" : v }))}>
                    <SelectTrigger id="add-t-grade"><SelectValue placeholder="Not set" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Not set</SelectItem>
                      {GRADES.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="add-t-email" className="text-xs">
                    Email <span className="text-muted-foreground">(for certificates)</span>
                  </Label>
                  <Input id="add-t-email" type="email" value={adding.email}
                    onChange={(e) => setAdding((a) => ({ ...a, email: e.target.value }))} />
                </div>
                <Button type="submit" disabled={!adding.name.trim()} className="w-full sm:w-auto">
                  <UserPlus className="mr-1.5 h-4 w-4" /> Add trainee
                </Button>
              </form>
              <p className="mt-2 text-[11px] text-muted-foreground">
                Grade keeps itself up to date: whatever a trainee picks at their next sign-in
                replaces it, since it changes between rotations.
              </p>
            </CardContent>
          </Card>
        )}

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
                    They stay in every past year's figures. Change or clear their status under
                    Long-term status to bring somebody back into the roster.
                  </p>
                </CollapsibleContent>
              </Collapsible>
            )}
          </>
        )}
      </section>
      )}

      {/* -------------------------------------------------------- sessions -- */}
      {part === "days" && (
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold">Teaching days</h2>
            <p className="text-xs text-muted-foreground">
              {sessions.length} recorded. The register year runs August to July; a month can
              hold as many teaching days as it needs. Each one gets its QR sign-in page as soon
              as it is added.
            </p>
          </div>
        </div>

        {canEdit && (
          <Card>
            <CardContent className="p-4">
              <TeachingDayForm idPrefix="add-day" submitLabel="Add teaching day"
                onSubmit={(draft) => onEdit((b) => upsertSession(b, sessionFromDraft(draft)))} />
            </CardContent>
          </Card>
        )}

        {sessions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No teaching days yet.</p>
        ) : (
          <div className="divide-y rounded-lg border">
            {sessions.map((s) => (
              <div key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{s.title}</p>
                  <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                    <span>{sessionWhen(s)}</span>
                    {!s.date && <span className="text-register-clay">no exact date — edit to add it</span>}
                    {s.location && (
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="h-3 w-3" /> {s.location}
                      </span>
                    )}
                  </p>
                </div>
                {canEdit && (
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" className="h-7 w-7" aria-label={`Edit ${s.title}`}
                      onClick={() => setSession(s)}>
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
      )}

      {/* -------------------------------------------------- trainee dialog -- */}
      <Dialog open={!!trainee} onOpenChange={(o) => !o && setTrainee(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit trainee</DialogTitle>
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
            <DialogTitle>Edit teaching day</DialogTitle>
          </DialogHeader>
          {session && (
            <TeachingDayForm
              key={session.id}
              layout="stack"
              idPrefix="edit-day"
              submitLabel="Save"
              initial={{ title: session.title, date: session.date ?? "", location: session.location ?? "" }}
              onCancel={() => setSession(null)}
              onSubmit={(draft) => {
                onEdit((b) => upsertSession(b, sessionFromDraft(draft, session)));
                setSession(null);
              }}
            />
          )}
          {session && !session.date && (
            <p className="text-[11px] text-muted-foreground">
              This day was recorded with only its month ({formatMonth(session.month, "en-GB")}).
              Give it its exact date to save.
            </p>
          )}
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
