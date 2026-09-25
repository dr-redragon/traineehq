import { useState } from "react";
import { CalendarPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { TeachingDayDraft } from "@/lib/register/teachingDay";
import { cn } from "@/lib/utils";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Title, date and place of a teaching day.
 *
 * A full date rather than a month: several teaching days can fall in one
 * month, and the date is what tells them apart — in the grid, on the QR
 * sign-in page and on the certificate.
 */
export function TeachingDayForm({
  initial, submitLabel, onSubmit, onCancel, layout = "row", idPrefix = "day",
}: {
  initial?: Partial<TeachingDayDraft>;
  submitLabel: string;
  onSubmit: (draft: TeachingDayDraft) => void;
  onCancel?: () => void;
  /** "row" sits across the top of a list; "stack" fits a dialog. */
  layout?: "row" | "stack";
  idPrefix?: string;
}) {
  const [draft, setDraft] = useState<TeachingDayDraft>({
    title: initial?.title ?? "", date: initial?.date ?? "", location: initial?.location ?? "",
  });
  const valid = !!draft.title.trim() && ISO_DATE.test(draft.date);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    onSubmit(draft);
    if (!initial) setDraft({ title: "", date: "", location: "" });
  };

  return (
    <form
      onSubmit={submit}
      className={cn(
        "grid gap-3",
        layout === "row" && "sm:grid-cols-[1.4fr,0.8fr,1fr,auto] sm:items-end",
      )}
    >
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-title`} className="text-xs">Title</Label>
        <Input id={`${idPrefix}-title`} value={draft.title} placeholder="e.g. Paediatric ENT"
          onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-date`} className="text-xs">Date</Label>
        <Input id={`${idPrefix}-date`} type="date" value={draft.date}
          onChange={(e) => setDraft((d) => ({ ...d, date: e.target.value }))} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-location`} className="text-xs">
          Location <span className="text-muted-foreground">(optional)</span>
        </Label>
        <Input id={`${idPrefix}-location`} value={draft.location} placeholder="e.g. Wythenshawe Hospital"
          onChange={(e) => setDraft((d) => ({ ...d, location: e.target.value }))} />
      </div>
      <div className={cn("flex gap-2", layout === "stack" && "justify-end")}>
        {onCancel && <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>}
        <Button type="submit" disabled={!valid} className={cn(layout === "row" && "w-full sm:w-auto")}>
          {!initial && <CalendarPlus className="mr-1.5 h-4 w-4" />}
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
