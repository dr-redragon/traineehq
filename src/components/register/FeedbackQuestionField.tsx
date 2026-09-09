import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import type { FeedbackQuestion } from "@/lib/register/types";
import { cn } from "@/lib/utils";

/**
 * One question on the feedback form.
 *
 * Shared between the form a trainee fills in and the editor's preview, so what
 * an organiser designs is drawn by the same code that will render it — a
 * preview built separately drifts, and the first person to notice is a trainee
 * standing in a corridor with a phone.
 */
export function FeedbackQuestionField({
  q, value, onChange,
}: {
  q: FeedbackQuestion;
  value: string | number | string[] | undefined;
  onChange: (v: string | number | string[]) => void;
}) {
  const label = (
    <Label className="text-sm font-medium">
      {q.text} {q.required && <span className="text-destructive">*</span>}
    </Label>
  );

  if (q.type === "scale") {
    return (
      <div className="space-y-2">
        {label}
        <div className="flex gap-1.5">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => onChange(n)}
              aria-label={`${n} out of 5`}
              className={cn(
                "h-11 flex-1 rounded-md border text-sm font-semibold transition-colors",
                Number(value) === n
                  ? "border-primary bg-primary text-primary-foreground"
                  : "hover:bg-muted",
              )}
            >
              {n}
            </button>
          ))}
        </div>
        <div className="flex justify-between text-[11px] text-muted-foreground">
          <span>{q.lowLabel ?? "Strongly disagree"}</span>
          <span>{q.highLabel ?? "Strongly agree"}</span>
        </div>
      </div>
    );
  }

  if (q.type === "choice") {
    return (
      <div className="space-y-2">
        {label}
        <RadioGroup value={String(value ?? "")} onValueChange={onChange}>
          {(q.options ?? []).map((o) => (
            <div key={o} className="flex items-center gap-2">
              <RadioGroupItem value={o} id={`${q.id}-${o}`} />
              <Label htmlFor={`${q.id}-${o}`} className="text-sm font-normal">{o}</Label>
            </div>
          ))}
        </RadioGroup>
      </div>
    );
  }

  if (q.type === "checkbox") {
    const chosen = Array.isArray(value) ? value : [];
    return (
      <div className="space-y-2">
        {label}
        {(q.options ?? []).map((o) => (
          <Label key={o} className="flex cursor-pointer items-center gap-2 text-sm font-normal">
            <Checkbox
              checked={chosen.includes(o)}
              onCheckedChange={(on) =>
                onChange(on === true ? [...chosen, o] : chosen.filter((x) => x !== o))}
            />
            {o}
          </Label>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {label}
      {q.type === "long" ? (
        <Textarea rows={3} value={String(value ?? "")} placeholder={q.placeholder}
          onChange={(e) => onChange(e.target.value)} />
      ) : (
        <Input value={String(value ?? "")} placeholder={q.placeholder}
          onChange={(e) => onChange(e.target.value)} />
      )}
    </div>
  );
}

