import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown, ArrowUp, Copy, Loader2, Plus, RotateCcw, Save, Trash2, X,
} from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { FeedbackQuestionField } from "@/components/register/FeedbackQuestionField";
import { YearChip } from "@/components/register/YearChip";
import { getForm, resetFormToTemplate, saveForm } from "@/lib/register/liveApi";
import {
  QUESTION_TYPE_LABEL, addOption, addQuestion, changeType, cloneForm, duplicateQuestion,
  formProblems, moveQuestion, removeOption, removeQuestion, setOption, updateQuestion,
} from "@/lib/register/formShape";
import type { FeedbackForm, QuestionType } from "@/lib/register/types";
import { cn } from "@/lib/utils";

type Scope = "session" | "template";

/**
 * Designing the feedback form.
 *
 * Two scopes, and the difference between them is the whole point. The
 * **template** is what every teaching day published from now on starts from;
 * **this session** is one day's own copy, which stops following the template the
 * moment it is saved. An organiser who wants to try a question on one cohort
 * without committing to it forever needs the second; one who has got the form
 * right needs the first — and "Save to the template too" is the bridge, because
 * having to re-navigate to promote a form you have just written is the kind of
 * step people skip.
 *
 * The preview is drawn by the same component that renders the real form, so it
 * cannot drift from what a trainee will see.
 */
export function FeedbackFormEditor({
  registerId, sessionId, sessionTitle, onClose,
}: {
  registerId: string;
  /** The published teaching day being edited, or null for the template alone. */
  sessionId?: string | null;
  sessionTitle?: string;
  onClose?: () => void;
}) {
  const queryClient = useQueryClient();
  const [scope, setScope] = useState<Scope>(sessionId ? "session" : "template");
  const [form, setForm] = useState<FeedbackForm | null>(null);
  const [inherited, setInherited] = useState(false);
  const [saving, setSaving] = useState<"one" | "both" | "reset" | null>(null);
  const [problems, setProblems] = useState<string[]>([]);

  const loaded = useQuery({
    queryKey: ["register-form", registerId, sessionId ?? null],
    queryFn: () => getForm({ registerId, sessionId: sessionId ?? null }),
    enabled: !!registerId,
  });

  // Re-seeded whenever the source changes, including a scope switch: the two
  // scopes are different documents, not two views of one.
  useEffect(() => {
    if (!loaded.data) return;
    setInherited(!!sessionId && loaded.data.source === "template");
    setForm(cloneForm(scope === "template" ? loaded.data.template : loaded.data.form));
    setProblems([]);
  }, [loaded.data, scope, sessionId]);

  const questionCount = form?.questions.length ?? 0;
  const scopeHelp = useMemo(() => {
    if (scope === "template") {
      return "Editing the template. Every teaching day published from now on starts from this. " +
        "Days that already have a form of their own are not touched.";
    }
    return inherited
      ? "This day has no form of its own yet, so it is showing the template. Saving gives it its " +
        "own copy — later template edits will not reach it."
      : "Editing this teaching day only. The template and every other day are unaffected.";
  }, [scope, inherited]);

  const update = (next: FeedbackForm) => { setForm(next); setProblems([]); };

  const persist = async (alsoTemplate: boolean) => {
    if (!form) return;
    const bad = formProblems(form);
    if (bad.length) { setProblems(bad); return; }

    setSaving(alsoTemplate ? "both" : "one");
    try {
      await saveForm({
        registerId,
        sessionId: scope === "session" ? sessionId : null,
        form,
        alsoTemplate,
      });
      await queryClient.invalidateQueries({ queryKey: ["register-form", registerId] });
      await queryClient.invalidateQueries({ queryKey: ["register-live-sessions", registerId] });
      setInherited(false);
      toast.success(
        scope === "template" ? "Template saved."
          : alsoTemplate ? "Saved to this teaching day and to the template."
          : "Saved to this teaching day.",
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save the form");
    } finally {
      setSaving(null);
    }
  };

  const reset = async () => {
    if (!sessionId) return;
    setSaving("reset");
    try {
      await resetFormToTemplate({ registerId, sessionId });
      await queryClient.invalidateQueries({ queryKey: ["register-form", registerId] });
      await queryClient.invalidateQueries({ queryKey: ["register-live-sessions", registerId] });
      toast.success("Back to the template.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not reset the form");
    } finally {
      setSaving(null);
    }
  };

  if (loaded.isLoading || !form) return <Skeleton className="h-96 w-full" />;
  if (loaded.isError) {
    return (
      <p className="text-sm text-destructive">
        {(loaded.error as Error)?.message ?? "Could not load the form."}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {sessionId && (
          <YearChip pressed={scope === "session"} onClick={() => setScope("session")}>
            This teaching day
          </YearChip>
        )}
        <YearChip pressed={scope === "template"} onClick={() => setScope("template")}>
          Template for new days
        </YearChip>
        {sessionTitle && scope === "session" && (
          <span className="text-xs text-muted-foreground">{sessionTitle}</span>
        )}
        {onClose && (
          <Button variant="ghost" size="sm" className="ml-auto" onClick={onClose}>
            <X className="mr-1.5 h-3.5 w-3.5" /> Close
          </Button>
        )}
      </div>

      <p className="text-xs text-muted-foreground">{scopeHelp}</p>

      <div className="grid gap-5 lg:grid-cols-[1fr,380px] lg:items-start">
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="form-title" className="text-xs">Form title</Label>
            <Input
              id="form-title" maxLength={120} value={form.title}
              onChange={(e) => update({ ...form, title: e.target.value })}
            />
          </div>

          {form.questions.map((q, i) => (
            <Card key={q.id} className="border-border/80">
              <CardContent className="space-y-3 p-3">
                <div className="flex gap-2">
                  <span className="pt-2.5 text-xs font-bold text-muted-foreground">{i + 1}</span>
                  <div className="min-w-0 flex-1 space-y-2">
                    {/* A textarea, not an input: a long question typed into a
                        single line scrolls out of sight on a phone, and nobody
                        proof-reads what they cannot see. */}
                    <Textarea
                      rows={2} maxLength={300} placeholder="Ask something…"
                      className="font-medium"
                      value={q.text}
                      onChange={(e) => update(updateQuestion(form, i, { text: e.target.value }))}
                    />

                    <div className="grid gap-2 sm:grid-cols-[190px,1fr]">
                      <Select
                        value={q.type}
                        disabled={q.locked}
                        onValueChange={(v) => update(changeType(form, i, v as QuestionType))}
                      >
                        <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {(Object.keys(QUESTION_TYPE_LABEL) as QuestionType[]).map((t) => (
                            <SelectItem key={t} value={t} className="text-xs">
                              {QUESTION_TYPE_LABEL[t]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      {(q.type === "short" || q.type === "long") && (
                        <Input
                          className="h-9 text-xs" maxLength={120} placeholder="Hint text (optional)"
                          value={q.placeholder ?? ""}
                          onChange={(e) =>
                            update(updateQuestion(form, i, { placeholder: e.target.value }))}
                        />
                      )}
                    </div>

                    {q.type === "scale" && (
                      <div className="grid gap-2 sm:grid-cols-2">
                        <Input
                          className="h-9 text-xs" maxLength={40} placeholder="Label for 1"
                          value={q.lowLabel ?? ""}
                          onChange={(e) =>
                            update(updateQuestion(form, i, { lowLabel: e.target.value }))}
                        />
                        <Input
                          className="h-9 text-xs" maxLength={40} placeholder="Label for 5"
                          value={q.highLabel ?? ""}
                          onChange={(e) =>
                            update(updateQuestion(form, i, { highLabel: e.target.value }))}
                        />
                      </div>
                    )}

                    {(q.type === "choice" || q.type === "checkbox") && (
                      <div className="space-y-1.5">
                        {(q.options ?? []).map((option, oi) => (
                          <div key={oi} className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">
                              {q.type === "choice" ? "○" : "☐"}
                            </span>
                            <Input
                              className="h-8 text-xs" maxLength={120}
                              placeholder={`Option ${oi + 1}`}
                              value={option}
                              onChange={(e) => update(setOption(form, i, oi, e.target.value))}
                            />
                            <Button
                              size="icon" variant="ghost" className="h-8 w-8"
                              disabled={(q.options ?? []).length <= 2}
                              aria-label={`Remove option ${oi + 1}`}
                              onClick={() => update(removeOption(form, i, oi))}
                            >
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        ))}
                        <Button
                          size="sm" variant="outline" className="h-7 text-xs"
                          onClick={() => update(addOption(form, i))}
                        >
                          <Plus className="mr-1 h-3 w-3" /> Add option
                        </Button>
                      </div>
                    )}

                    <div className="flex flex-wrap items-center gap-3 border-t pt-2">
                      <Label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                        <Switch
                          checked={q.required}
                          onCheckedChange={(on) => update(updateQuestion(form, i, { required: on }))}
                        />
                        Required
                      </Label>
                      {q.locked && (
                        <span className="text-[11px] italic text-muted-foreground">
                          built in — kept on every form
                        </span>
                      )}
                      <span className="flex-1" />
                      <Button
                        size="icon" variant="ghost" className="h-7 w-7" disabled={i === 0}
                        aria-label="Move up" onClick={() => update(moveQuestion(form, i, -1))}
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon" variant="ghost" className="h-7 w-7"
                        disabled={i === questionCount - 1}
                        aria-label="Move down" onClick={() => update(moveQuestion(form, i, 1))}
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon" variant="ghost" className="h-7 w-7"
                        aria-label="Duplicate" onClick={() => update(duplicateQuestion(form, i))}
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon" variant="ghost"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        disabled={q.locked}
                        aria-label="Delete question"
                        title={q.locked
                          ? "This one is part of every form"
                          : "Delete this question. Answers already given to it stay in the database."}
                        onClick={() => update(removeQuestion(form, i))}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}

          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(QUESTION_TYPE_LABEL) as QuestionType[]).map((t) => (
              <Button
                key={t} size="sm" variant="outline" className="h-8 text-xs"
                onClick={() => update(addQuestion(form, t).form)}
              >
                <Plus className="mr-1 h-3 w-3" /> {QUESTION_TYPE_LABEL[t]}
              </Button>
            ))}
          </div>

          {problems.length > 0 && (
            <Alert variant="destructive">
              <AlertDescription className="text-xs">
                <ul className="ml-4 list-disc space-y-0.5">
                  {problems.map((p) => <li key={p}>{p}</li>)}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          <div className="flex flex-wrap gap-2 border-t pt-3">
            <Button onClick={() => persist(false)} disabled={saving !== null}>
              {saving === "one"
                ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                : <Save className="mr-1.5 h-4 w-4" />}
              Save
            </Button>
            {scope === "session" && (
              <Button variant="outline" onClick={() => persist(true)} disabled={saving !== null}>
                {saving === "both" && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                Save to the template too
              </Button>
            )}
            {scope === "session" && !inherited && (
              <Button variant="ghost" onClick={reset} disabled={saving !== null}>
                {saving === "reset"
                  ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  : <RotateCcw className="mr-1.5 h-4 w-4" />}
                Reset to the template
              </Button>
            )}
          </div>
        </div>

        {/* Exactly what a trainee will see, drawn by the trainee's own
            component. Inert: this is a rehearsal, not a form to fill in. */}
        <Card className="lg:sticky lg:top-16">
          <CardContent className="space-y-5 p-4">
            <div>
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Preview</p>
              <h3 className="font-display text-lg font-bold">
                {form.title || "Session feedback"}
              </h3>
            </div>
            {form.questions.length ? (
              <div
                className={cn("space-y-5 opacity-95")}
                aria-hidden="true"
                style={{ pointerEvents: "none" }}
              >
                {form.questions.map((q) => (
                  <FeedbackQuestionField key={q.id} q={q} value={undefined} onChange={() => {}} />
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No questions yet — add one on the left.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
