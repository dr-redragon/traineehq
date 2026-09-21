import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FeedbackField } from "@/components/classic/FeedbackField";
import { getForm, resetFormToTemplate, saveForm } from "@/lib/classic/liveApi";
import {
  QUESTION_TYPE_LABEL, addOption, addQuestion, changeType, cloneForm, duplicateQuestion,
  formProblems, moveQuestion, removeOption, removeQuestion, setOption, updateQuestion,
} from "@/lib/classic/formShape";
import type { FeedbackForm, QuestionType } from "@/lib/classic/types";

type Scope = "session" | "template";

/**
 * Designing the feedback form — the classic register's own copy of the
 * standalone app's form-editor.html, folded into a panel rather than a page
 * of its own.
 *
 * Two scopes, and the difference between them is the whole point. The
 * **template** is what every teaching day published from now on starts from;
 * **this session** is one day's own copy, which stops following the template
 * the moment it is saved. "Save to the template too" exists because having to
 * re-open this editor a second time just to promote a form just written is
 * the kind of step people skip.
 */
export function FeedbackFormEditor({
  registerId,
  sessionId,
  sessionTitle,
  onClose,
}: {
  registerId: string;
  /** The published teaching day being edited, or null/undefined for the template alone. */
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
    queryKey: ["classic-form", registerId, sessionId ?? null],
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
      await queryClient.invalidateQueries({ queryKey: ["classic-form", registerId] });
      setInherited(false);
      toast.success(
        scope === "template" ? "Template saved."
          : alsoTemplate ? "Saved to this teaching day and to the template."
          : "Saved to this teaching day.");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSaving(null);
    }
  };

  const reset = async () => {
    if (!sessionId) return;
    setSaving("reset");
    try {
      await resetFormToTemplate({ registerId, sessionId });
      await queryClient.invalidateQueries({ queryKey: ["classic-form", registerId] });
      toast.success("Back to the template.");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSaving(null);
    }
  };

  if (loaded.isLoading || !form) return <p className="helper">Loading the form…</p>;
  if (loaded.isError) {
    return <div className="notice bad">{(loaded.error as Error)?.message ?? "Could not load the form."}</div>;
  }

  return (
    <div>
      <div className="row-actions" style={{ alignItems: "center" }}>
        {sessionId && (
          <button
            type="button"
            className={"yr-tab" + (scope === "session" ? " on" : "")}
            aria-pressed={scope === "session"}
            onClick={() => setScope("session")}
          >
            This teaching day
          </button>
        )}
        <button
          type="button"
          className={"yr-tab" + (scope === "template" ? " on" : "")}
          aria-pressed={scope === "template"}
          onClick={() => setScope("template")}
        >
          Template for new days
        </button>
        {sessionTitle && scope === "session" && (
          <span className="li-sub">{sessionTitle}</span>
        )}
      </div>

      <p className="helper">{scopeHelp}</p>

      <div className="form-editor-grid" style={{ marginTop: 12 }}>
        <div>
          <div className="field">
            <label className="fld">Form title</label>
            <input
              maxLength={120}
              value={form.title}
              onChange={(e) => update({ ...form, title: e.target.value })}
            />
          </div>

          {form.questions.map((q, i) => (
            <div className="card pad" key={q.id} style={{ marginTop: 10 }}>
              <div className="row-actions" style={{ alignItems: "flex-start", flexWrap: "nowrap" }}>
                <span style={{ fontWeight: 700, fontSize: 13, color: "var(--muted)", paddingTop: 8 }}>
                  {i + 1}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <textarea
                    rows={2}
                    maxLength={300}
                    placeholder="Ask something…"
                    value={q.text}
                    onChange={(e) => update(updateQuestion(form, i, { text: e.target.value }))}
                  />

                  <div className="inline-form" style={{ gridTemplateColumns: "190px 1fr", marginTop: 8 }}>
                    <div>
                      <select
                        value={q.type}
                        disabled={q.locked}
                        onChange={(e) => update(changeType(form, i, e.target.value as QuestionType))}
                      >
                        {(Object.keys(QUESTION_TYPE_LABEL) as QuestionType[]).map((t) => (
                          <option key={t} value={t}>{QUESTION_TYPE_LABEL[t]}</option>
                        ))}
                      </select>
                    </div>
                    {(q.type === "short" || q.type === "long") && (
                      <div>
                        <input
                          maxLength={120}
                          placeholder="Hint text (optional)"
                          value={q.placeholder ?? ""}
                          onChange={(e) => update(updateQuestion(form, i, { placeholder: e.target.value }))}
                        />
                      </div>
                    )}
                  </div>

                  {q.type === "scale" && (
                    <div className="inline-form" style={{ gridTemplateColumns: "1fr 1fr", marginTop: 8 }}>
                      <div>
                        <input
                          maxLength={40}
                          placeholder="Label for 1"
                          value={q.lowLabel ?? ""}
                          onChange={(e) => update(updateQuestion(form, i, { lowLabel: e.target.value }))}
                        />
                      </div>
                      <div>
                        <input
                          maxLength={40}
                          placeholder="Label for 5"
                          value={q.highLabel ?? ""}
                          onChange={(e) => update(updateQuestion(form, i, { highLabel: e.target.value }))}
                        />
                      </div>
                    </div>
                  )}

                  {(q.type === "choice" || q.type === "checkbox") && (
                    <div style={{ marginTop: 8 }}>
                      {(q.options ?? []).map((option, oi) => (
                        <div className="row-actions" style={{ marginTop: 6, alignItems: "center" }} key={oi}>
                          <span className="li-sub" style={{ width: 14 }}>
                            {q.type === "choice" ? "○" : "☐"}
                          </span>
                          <input
                            style={{ flex: 1 }}
                            maxLength={120}
                            placeholder={`Option ${oi + 1}`}
                            value={option}
                            onChange={(e) => update(setOption(form, i, oi, e.target.value))}
                          />
                          <button
                            type="button"
                            className="btn ghost sm"
                            disabled={(q.options ?? []).length <= 2}
                            aria-label={`Remove option ${oi + 1}`}
                            onClick={() => update(removeOption(form, i, oi))}
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        className="btn ghost sm"
                        style={{ marginTop: 6 }}
                        onClick={() => update(addOption(form, i))}
                      >
                        + Add option
                      </button>
                    </div>
                  )}

                  <div className="row-actions" style={{
                    marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--line)", alignItems: "center",
                  }}>
                    <label className="report-check" style={{ margin: 0 }}>
                      <input
                        type="checkbox"
                        checked={q.required}
                        onChange={(e) => update(updateQuestion(form, i, { required: e.target.checked }))}
                      />
                      Required
                    </label>
                    {q.locked && (
                      <span className="li-sub" style={{ fontStyle: "italic" }}>
                        built in — kept on every form
                      </span>
                    )}
                    <span style={{ flex: 1 }} />
                    <button
                      type="button"
                      className="btn ghost sm"
                      disabled={i === 0}
                      aria-label="Move up"
                      onClick={() => update(moveQuestion(form, i, -1))}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="btn ghost sm"
                      disabled={i === questionCount - 1}
                      aria-label="Move down"
                      onClick={() => update(moveQuestion(form, i, 1))}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className="btn ghost sm"
                      aria-label="Duplicate"
                      onClick={() => update(duplicateQuestion(form, i))}
                    >
                      Duplicate
                    </button>
                    <button
                      type="button"
                      className="btn ghost sm"
                      disabled={q.locked}
                      aria-label="Delete question"
                      title={q.locked
                        ? "This one is part of every form"
                        : "Delete this question. Answers already given to it stay in the database."}
                      onClick={() => update(removeQuestion(form, i))}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}

          <div className="row-actions" style={{ marginTop: 12, flexWrap: "wrap" }}>
            {(Object.keys(QUESTION_TYPE_LABEL) as QuestionType[]).map((t) => (
              <button
                key={t}
                type="button"
                className="btn ghost sm"
                onClick={() => update(addQuestion(form, t).form)}
              >
                + {QUESTION_TYPE_LABEL[t]}
              </button>
            ))}
          </div>

          {problems.length > 0 && (
            <div className="notice bad" style={{ marginTop: 12 }}>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {problems.map((p) => <li key={p}>{p}</li>)}
              </ul>
            </div>
          )}

          <div className="row-actions" style={{
            marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--line)",
          }}>
            <button type="button" className="btn primary" disabled={saving !== null} onClick={() => persist(false)}>
              {saving === "one" ? "Saving…" : "Save"}
            </button>
            {scope === "session" && (
              <button
                type="button"
                className="btn ghost"
                disabled={saving !== null}
                onClick={() => persist(true)}
              >
                {saving === "both" ? "Saving…" : "Save to the template too"}
              </button>
            )}
            {scope === "session" && !inherited && (
              <button type="button" className="btn ghost" disabled={saving !== null} onClick={reset}>
                {saving === "reset" ? "Working…" : "Reset to the template"}
              </button>
            )}
            {onClose && (
              <button type="button" className="btn ghost" style={{ marginLeft: "auto" }} onClick={onClose}>
                Close
              </button>
            )}
          </div>
        </div>

        {/* Exactly what a trainee will see, drawn by the same component that
            renders the real form, so it cannot drift from it. */}
        <div className="card pad" style={{ alignSelf: "start" }}>
          <label className="fld">Preview</label>
          <h3 style={{ marginTop: 2, marginBottom: 14 }}>{form.title || "Session feedback"}</h3>
          {form.questions.length ? (
            <div aria-hidden="true" style={{ pointerEvents: "none", opacity: 0.95 }}>
              {form.questions.map((q) => (
                <FeedbackField key={q.id} question={q} value={undefined} onChange={() => {}} />
              ))}
            </div>
          ) : (
            <p className="helper">No questions yet — add one on the left.</p>
          )}
        </div>
      </div>
    </div>
  );
}
