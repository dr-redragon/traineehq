import type { FeedbackForm, FeedbackQuestion, FeedbackResponse } from "./types";

/**
 * What a cohort said about a teaching day, reduced to something readable.
 *
 * Ported from the standalone register's session console. Three things about it
 * matter and are easy to get wrong:
 *
 *  - The wording comes from the session's **own** stored form, never a current
 *    template. Rewording a question later must not relabel answers given to the
 *    old one.
 *  - A question that has since been deleted from the form still reports what it
 *    got. The answers are the record; the form is only how they were asked.
 *  - How an answer is summarised follows its type, not its shape. A 1–5 scale
 *    averages, a choice or checkbox is tallied, free text is listed. Averaging
 *    a set of option indices would produce a number that means nothing.
 */

export const mean = (values: number[]): number | null =>
  values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;

export interface ScaleResult {
  kind: "scale";
  id: string;
  label: string;
  average: number | null;
  count: number;
}

export interface TallyResult {
  kind: "tally";
  id: string;
  label: string;
  options: { option: string; count: number }[];
  count: number;
}

export interface TextResult {
  kind: "text";
  id: string;
  label: string;
  answers: string[];
}

export type QuestionResult = ScaleResult | TallyResult | TextResult;

export interface FeedbackSummary {
  responses: number;
  /** How many signed in, so a response rate can be worked out. */
  attendees: number;
  responseRate: number | null;
  overall: number | null;
  /** Counts for 1..5, in that order. */
  distribution: number[];
  questions: QuestionResult[];
  comments: FeedbackResponse[];
  /** Words that come up in more than one comment, commonest first. */
  themes: { word: string; count: number }[];
}

const answerValues = (responses: FeedbackResponse[], id: string) =>
  responses.map((r) => r.answers?.[id]);

const flatten = (values: unknown[]): unknown[] =>
  values.flatMap((v) => (Array.isArray(v) ? v : v == null ? [] : [v]));

/**
 * A rough aid, not a claim: the words that come up most across the comments.
 *
 * Each comment counts a word once, so one person saying "airway" ten times does
 * not become a theme. Only words in more than one comment survive, which is
 * what makes it a theme rather than a quotation.
 */
const STOPWORDS = new Set((
  "the a an and or but of to in on for with was were is are be been it its this that they them " +
  "their we our i my you your me he she his her at as by from so very more most much really " +
  "quite just also had have has do does did not no yes if then than there here session sessions " +
  "teaching day would could should about all some any what which when who how why get got well " +
  "good great"
).split(" "));

export function feedbackThemes(responses: FeedbackResponse[]): { word: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const r of responses) {
    const words = String(r.comments ?? "").toLowerCase().match(/[a-z][a-z'-]{2,}/g) ?? [];
    for (const word of new Set(words)) {
      if (STOPWORDS.has(word)) continue;
      counts.set(word, (counts.get(word) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .filter(([, n]) => n > 1)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 12)
    .map(([word, count]) => ({ word, count }));
}

/** Which question an answer key belongs to, from this session's own form. */
function definitionFor(form: FeedbackForm | null | undefined, id: string): FeedbackQuestion | null {
  return form?.questions.find((q) => q.id === id) ?? null;
}

export function summariseFeedback(
  responses: FeedbackResponse[],
  form: FeedbackForm | null | undefined,
  attendees: number,
): FeedbackSummary {
  const overallValues = responses
    .map((r) => r.overall_rating)
    .filter((n): n is number => typeof n === "number");

  const distribution = [1, 2, 3, 4, 5].map(
    (n) => responses.filter((r) => r.overall_rating === n).length,
  );

  // Every key anybody actually answered, in the form's own order first so the
  // report reads down the page the way the form did, then anything left over.
  const answered = [...new Set(responses.flatMap((r) => Object.keys(r.answers ?? {})))]
    .filter((k) => k !== "overall");
  const asked = (form?.questions ?? [])
    .map((q) => q.id)
    .filter((id) => id !== "overall" && answered.includes(id));
  const keys = [...asked, ...answered.filter((k) => !asked.includes(k))];

  const questions: QuestionResult[] = [];
  for (const id of keys) {
    const def = definitionFor(form, id);
    const label = def?.text ?? id;
    const values = answerValues(responses, id);
    const numbers = values.filter((v): v is number => typeof v === "number");

    if (numbers.length && (!def || def.type === "scale")) {
      questions.push({
        kind: "scale", id, label, average: mean(numbers), count: numbers.length,
      });
      continue;
    }

    const picks = flatten(values);

    if (def && (def.type === "choice" || def.type === "checkbox")) {
      const tally = new Map<string, number>();
      for (const pick of picks) {
        const key = String(pick);
        tally.set(key, (tally.get(key) ?? 0) + 1);
      }
      // The form's own options first, including any nobody picked — a zero is
      // a finding, and dropping it hides that the option was offered at all.
      const options = [...new Set([...(def.options ?? []), ...tally.keys()])]
        .map((option) => ({ option, count: tally.get(option) ?? 0 }));
      questions.push({ kind: "tally", id, label, options, count: picks.length });
      continue;
    }

    const texts = picks
      .filter((v): v is string => typeof v === "string" && v.trim() !== "")
      .map((v) => v.trim());
    if (texts.length) questions.push({ kind: "text", id, label, answers: texts });
  }

  return {
    responses: responses.length,
    attendees,
    responseRate: attendees ? Math.round((responses.length / attendees) * 100) : null,
    overall: mean(overallValues),
    distribution,
    questions,
    comments: responses.filter((r) => (r.comments ?? "").trim() !== ""),
    themes: feedbackThemes(responses),
  };
}
