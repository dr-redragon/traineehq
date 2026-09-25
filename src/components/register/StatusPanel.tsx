import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
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
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MonthInput } from "@/components/register/MonthInput";
import { newId, removeStatus, upsertStatus } from "@/lib/register/blob";
import { STATUS_LABELS, STATUS_OPTIONS, statusRangeText } from "@/lib/register/statusText";
import type { RegisterEdit } from "@/hooks/useRegisterStore";
import type { RegisterBlob, RegisterStatus } from "@/lib/register/types";

type Draft = Partial<RegisterStatus>;

/** The fields of one status record. Used for a new one and, in a popup, to edit one. */
function StatusFields({
  draft, onChange, idPrefix, trainees, nameOf,
}: {
  draft: Draft;
  onChange: (update: (d: Draft) => Draft) => void;
  idPrefix: string;
  trainees: { id: string; name: string }[];
  nameOf: (id: string) => string;
}) {
  const hint = STATUS_OPTIONS.find((o) => o.value === (draft.type ?? "mat"))?.hint;
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-trainee`} className="text-xs">Trainee</Label>
          <Select value={draft.trainee ?? ""} onValueChange={(v) => onChange((d) => ({ ...d, trainee: v }))}>
            <SelectTrigger id={`${idPrefix}-trainee`}><SelectValue placeholder="Choose" /></SelectTrigger>
            <SelectContent>
              {trainees.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-type`} className="text-xs">Status</Label>
          <Select
            value={draft.type ?? "mat"}
            onValueChange={(v) => onChange((d) => ({ ...d, type: v as RegisterStatus["type"] }))}
          >
            <SelectTrigger id={`${idPrefix}-type`}><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-start`} className="text-xs">From</Label>
          <MonthInput id={`${idPrefix}-start`} value={draft.start ?? ""}
            onChange={(m) => onChange((d) => ({ ...d, start: m || null }))} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-end`} className="text-xs">To</Label>
          <MonthInput id={`${idPrefix}-end`} value={draft.end ?? ""}
            onChange={(m) => onChange((d) => ({ ...d, end: m || null }))} />
        </div>
      </div>

      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}

      {draft.trainee && draft.type && (
        <p className="rounded-md bg-muted px-3 py-2 text-xs">
          <strong>{nameOf(draft.trainee)}</strong>{" "}
          {statusRangeText({
            id: "", trainee: draft.trainee, type: draft.type,
            start: draft.start ?? null, end: draft.end ?? null,
          })}
        </p>
      )}
    </div>
  );
}

/**
 * Long-term status.
 *
 * Its own panel, as in the original, because it is the one place where a number
 * on the attendance grid can be changed without touching a single attendance
 * mark: a month outside a trainee's active window counts towards neither the
 * numerator nor the denominator. Somebody looking at an unexpected percentage
 * needs to be able to find this quickly.
 *
 * Adding happens in the form that is always open at the top; editing an
 * existing record opens it in a popup over the list, so nobody has to scroll
 * back up to change a row they are looking at.
 */
export function StatusPanel({
  blob, onEdit, canEdit,
}: {
  blob: RegisterBlob;
  onEdit: (edit: RegisterEdit) => void;
  canEdit: boolean;
}) {
  const blank: Draft = { type: "mat" };
  const [draft, setDraft] = useState<Draft>(blank);
  const [editing, setEditing] = useState<Draft | null>(null);
  const [confirm, setConfirm] = useState<RegisterStatus | null>(null);

  const trainees = [...blob.trainees].sort((a, b) => a.name.localeCompare(b.name));
  const nameOf = (id: string) => blob.trainees.find((t) => t.id === id)?.name ?? "Unknown trainee";
  const rows = blob.status.filter((s) => s.type !== "active");

  const save = (d: Draft) => {
    if (!d.trainee || !d.type) return;
    onEdit((b) => upsertStatus(b, {
      id: d.id ?? newId(),
      trainee: d.trainee!,
      type: d.type!,
      start: d.start || null,
      end: d.end || null,
    }));
  };

  return (
    <div className="space-y-4">
      {canEdit && (
        <Card>
          <CardContent className="space-y-3 p-4">
            <p className="text-sm font-semibold">New status</p>
            <StatusFields draft={draft} onChange={setDraft} idPrefix="st-new"
              trainees={trainees} nameOf={nameOf} />
            <div className="flex gap-2">
              <Button size="sm" disabled={!draft.trainee || !draft.type}
                onClick={() => { save(draft); setDraft(blank); }}>
                Add status
              </Button>
              {draft.trainee && (
                <Button size="sm" variant="outline" onClick={() => setDraft(blank)}>Clear</Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <p className="max-w-2xl text-xs text-muted-foreground">
        Set when a trainee completes training (CCT), goes on maternity or paternity leave, out
        of programme, or transfers between deaneries. Teaching days outside their active window
        are marked <strong>not eligible</strong> and count towards neither attendance nor the
        total.
      </p>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nothing recorded. Every trainee counts for every teaching day.
        </p>
      ) : (
        <div className="divide-y rounded-lg border">
          {rows.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{nameOf(s.trainee)}</p>
                <p className="text-xs text-muted-foreground">{statusRangeText(s)}</p>
              </div>
              <Badge variant="secondary" className="text-[10px]">{STATUS_LABELS[s.type]}</Badge>
              {canEdit && (
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" className="h-7 w-7"
                    aria-label={`Edit ${nameOf(s.trainee)}'s status`} onClick={() => setEditing(s)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive"
                    aria-label={`Remove ${nameOf(s.trainee)}'s status`} onClick={() => setConfirm(s)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit {editing?.trainee ? `${nameOf(editing.trainee)}'s` : ""} status</DialogTitle>
          </DialogHeader>
          {editing && (
            <StatusFields draft={editing} onChange={(u) => setEditing((d) => (d ? u(d) : d))}
              idPrefix="st-edit" trainees={trainees} nameOf={nameOf} />
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button disabled={!editing?.trainee || !editing?.type}
              onClick={() => { if (editing) save(editing); setEditing(null); }}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this status?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm && `${nameOf(confirm.trainee)} becomes eligible for every teaching day
              again, and their adjusted attendance is recalculated from scratch.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (confirm) onEdit((b) => removeStatus(b, confirm.id)); setConfirm(null); }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
