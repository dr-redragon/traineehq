import type { FeedbackForm, FeedbackQuestion, QuestionType } from "./types";

/**
 * Editing the shape of a feedback form.
 *
 * Pure functions over the form document, kept apart from the editor so the
 * rules — what a new question looks like, where it may go, what makes a form
 * invalid — can be read and tested without a React tree. The edge function
 * validates the same things again on save; this half exists to stop an
 * organiser reaching that point with a form it will refuse.
 */

export const QUESTION_TYPE_LABEL: Record<QuestionType, string> = {
  scale: "Rating 1–5",
  choice: "Multiple choice (pick one)",
  checkbox: "Checkboxes (pick any)",
  short: "Short answer",
  long: "Long answer",
};

export const EMPTY_FORM: FeedbackForm = { title: "Session feedback", questions: [] };

export const cloneForm = (form: FeedbackForm | null | undefined): FeedbackForm =>
  JSON.parse(JSON.stringify(form ?? EMPTY_FORM)) as FeedbackForm;

/**
 * A readable id derived from the question's own words.
 *
 * Answers are stored keyed by id, so an id that changes orphans every answer
 * already given to that question. New ones are minted once, here, and never
 * rewritten afterwards.
 */
export function questionId(text: string, taken: Set<string>): string {
  const base = String(text || "question")
    .toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 30) || "question";
  let id = base;
  let n = 2;
  while (taken.has(id)) id = `${base}_${n++}`;
  return id;
}

function blank(type: QuestionType, taken: Set<string>): FeedbackQuestion {
  const q: FeedbackQuestion = {
    id: questionId(`question ${taken.size + 1}`, taken),
    type,
    text: "",
    required: false,
  };
  if (type === "scale") { q.lowLabel = "Strongly disagree"; q.highLabel = "Strongly agree"; }
  if (type === "choice" || type === "checkbox") q.options = ["Option 1", "Option 2"];
  return q;
}

/**
 * Add a question, landing it before any locked questions at the end.
 *
 * The overall rating and the closing free-text box are part of every form and
 * belong last; a new question dropped after them reads as an afterthought
 * appended below the sign-off.
 */
export function addQuestion(form: FeedbackForm, type: QuestionType): {
  form: FeedbackForm; index: number;
} {
  const taken = new Set(form.questions.map((q) => q.id));
  let at = form.questions.length;
  while (at > 0 && form.questions[at - 1].locked) at--;
  const questions = [...form.questions];
  questions.splice(at, 0, blank(type, taken));
  return { form: { ...form, questions }, index: at };
}

export function updateQuestion(
  form: FeedbackForm, index: number, patch: Partial<FeedbackQuestion>,
): FeedbackForm {
  const questions = form.questions.map((q, i) => (i === index ? { ...q, ...patch } : q));
  return { ...form, questions };
}

/** Change a question's type, fitting it out with what that type needs. */
export function changeType(form: FeedbackForm, index: number, type: QuestionType): FeedbackForm {
  const q = form.questions[index];
  if (!q || q.type === type) return form;
  const next: FeedbackQuestion = { id: q.id, type, text: q.text, required: q.required };
  if (type === "scale") {
    next.lowLabel = q.lowLabel ?? "Strongly disagree";
    next.highLabel = q.highLabel ?? "Strongly agree";
  }
  if (type === "choice" || type === "checkbox") {
    next.options = q.options?.length ? q.options : ["Option 1", "Option 2"];
  }
  if (type === "short" || type === "long") {
    if (q.placeholder) next.placeholder = q.placeholder;
  }
  if (q.locked) next.locked = true;
  return { ...form, questions: form.questions.map((x, i) => (i === index ? next : x)) };
}

export function moveQuestion(form: FeedbackForm, index: number, delta: number): FeedbackForm {
  const to = index + delta;
  if (to < 0 || to >= form.questions.length) return form;
  const questions = [...form.questions];
  const [q] = questions.splice(index, 1);
  questions.splice(to, 0, q);
  return { ...form, questions };
}

/** A copy of a built-in question is an ordinary one — it loses the lock. */
export function duplicateQuestion(form: FeedbackForm, index: number): FeedbackForm {
  const taken = new Set(form.questions.map((q) => q.id));
  const copy = JSON.parse(JSON.stringify(form.questions[index])) as FeedbackQuestion;
  delete copy.locked;
  copy.id = questionId(copy.text || "question", taken);
  const questions = [...form.questions];
  questions.splice(index + 1, 0, copy);
  return { ...form, questions };
}

export function removeQuestion(form: FeedbackForm, index: number): FeedbackForm {
  return { ...form, questions: form.questions.filter((_, i) => i !== index) };
}

export function setOption(
  form: FeedbackForm, index: number, optionIndex: number, value: string,
): FeedbackForm {
  const options = [...(form.questions[index].options ?? [])];
  options[optionIndex] = value;
  return updateQuestion(form, index, { options });
}

export function addOption(form: FeedbackForm, index: number): FeedbackForm {
  const options = [...(form.questions[index].options ?? [])];
  return updateQuestion(form, index, { options: [...options, `Option ${options.length + 1}`] });
}

/** Two options is the floor: a "choice" of one is not a question. */
export function removeOption(form: FeedbackForm, index: number, optionIndex: number): FeedbackForm {
  const options = (form.questions[index].options ?? []).filter((_, i) => i !== optionIndex);
  if (options.length < 2) return form;
  return updateQuestion(form, index, { options });
}

/** Everything that would make the server refuse this form, said in advance. */
export function formProblems(form: FeedbackForm): string[] {
  const out: string[] = [];
  if (!form.questions.length) out.push("The form needs at least one question.");
  if (form.questions.length > 40) out.push("That is more than 40 questions.");
  form.questions.forEach((q, i) => {
    if (!String(q.text ?? "").trim()) out.push(`Question ${i + 1} has no text.`);
    if ((q.type === "choice" || q.type === "checkbox")
      && (q.options ?? []).filter((o) => o.trim()).length < 2) {
      out.push(`Question ${i + 1} needs at least two options.`);
    }
  });
  return out;
}
