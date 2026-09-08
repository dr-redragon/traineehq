import { useState } from "react";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MonthInput } from "@/components/register/MonthInput";
import { newId, removeStatus, upsertStatus } from "@/lib/register/blob";
import { STATUS_LABELS, STATUS_OPTIONS, statusRangeText } from "@/lib/register/statusText";
import type { RegisterEdit } from "@/hooks/useRegisterStore";
import type { RegisterBlob, RegisterStatus } from "@/lib/register/types";

type Draft = Partial<RegisterStatus>;

/**
 * Long-term status.
 *
 * Its own panel, as in the original, because it is the one place where a number
 * on the attendance grid can be changed without touching a single attendance
 * mark: a month outside a trainee's active window counts towards neither the
 * numerator nor the denominator. Somebody looking at an unexpected percentage
 * needs to be able to find this quickly.
 */
export function StatusPanel({
  blob, onEdit, canEdit,
}: {
  blob: RegisterBlob;
  onEdit: (edit: RegisterEdit) => void;
  canEdit: boolean;
}) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [confirm, setConfirm] = useState<RegisterStatus | null>(null);

  const trainees = [...blob.trainees].sort((a, b) => a.name.localeCompare(b.name));
  const nameOf = (id: string) => blob.trainees.find((t) => t.id === id)?.name ?? "Unknown trainee";
  const rows = blob.status.filter((s) => s.type !== "active");

  const hint = STATUS_OPTIONS.find((o) => o.value === (draft?.type ?? "mat"))?.hint;

  const save = () => {
    if (!draft?.trainee || !draft.type) return;
    onEdit((b) => upsertStatus(b, {
      id: draft.id ?? newId(),
      trainee: draft.trainee!,
      type: draft.type!,
      start: draft.start || null,
      end: draft.end || null,
    }));
    setDraft(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="max-w-2xl text-sm text-muted-foreground">
          Set when a trainee completes training (CCT), goes on maternity or paternity leave,
          out of programme, or transfers between deaneries. Teaching days outside their
          active window are marked <strong>not eligible</strong> and count towards neither
          attendance nor the total.
        </p>
        {canEdit && !draft && (
          <Button size="sm" className="w-full sm:w-auto" onClick={() => setDraft({ type: "mat" })}>
            <Plus className="mr-1.5 h-4 w-4" /> Add status
          </Button>
        )}
      </div>

      {draft && (
        <Card>
          <CardContent className="space-y-3 p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">
                {draft.id ? `Editing ${nameOf(draft.trainee ?? "")}` : "New status"}
              </p>
              <Button size="icon" variant="ghost" className="h-7 w-7"
                aria-label="Cancel" onClick={() => setDraft(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="st-trainee" className="text-xs">Trainee</Label>
                <Select
                  value={draft.trainee ?? ""}
                  onValueChange={(v) => setDraft((d) => ({ ...d, trainee: v }))}
                >
                  <SelectTrigger id="st-trainee"><SelectValue placeholder="Choose" /></SelectTrigger>
                  <SelectContent>
                    {trainees.map((t) => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="st-type" className="text-xs">Status</Label>
                <Select
                  value={draft.type ?? "mat"}
                  onValueChange={(v) => setDraft((d) => ({ ...d, type: v as RegisterStatus["type"] }))}
                >
                  <SelectTrigger id="st-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="st-start" className="text-xs">From</Label>
                <MonthInput id="st-start" value={draft.start ?? ""}
                  onChange={(m) => setDraft((d) => ({ ...d, start: m || null }))} />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="st-end" className="text-xs">To</Label>
                <MonthInput id="st-end" value={draft.end ?? ""}
                  onChange={(m) => setDraft((d) => ({ ...d, end: m || null }))} />
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

            <div className="flex gap-2">
              <Button size="sm" onClick={save} disabled={!draft.trainee || !draft.type}>
                {draft.id ? "Save status" : "Add status"}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setDraft(null)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

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
                    aria-label="Edit status" onClick={() => setDraft(s)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive"
                    aria-label="Remove status" onClick={() => setConfirm(s)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

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
