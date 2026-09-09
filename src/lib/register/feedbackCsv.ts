import type { FeedbackForm, FeedbackResponse } from "./types";

/**
 * Feedback responses as a spreadsheet.
 *
 * One row per response, in the order the form asks its questions rather than
 * the order the keys happen to appear in the JSON — a column order that shifts
 * between exports is unusable for anyone comparing two teaching days.
 *
 * Still anonymous: these rows carry no identifier and none is invented here.
 */

/** RFC 4180 quoting: only where it is needed, so the file stays readable. */
export function csvCell(value: unknown): string {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const answerText = (value: unknown): string =>
  Array.isArray(value) ? value.join("; ") : String(value ?? "");

export function feedbackCsv(
  responses: FeedbackResponse[],
  form: FeedbackForm | null | undefined,
): string {
  const asked = (form?.questions ?? []).filter((q) => q.id !== "overall");
  // Anything answered that the form no longer asks — a question deleted since —
  // still belongs in the export, appended after the ones it does ask.
  const extra = [...new Set(responses.flatMap((r) => Object.keys(r.answers ?? {})))]
    .filter((k) => k !== "overall" && !asked.some((q) => q.id === k));

  const columns = [
    ...asked.map((q) => ({ key: q.id, label: q.text })),
    ...extra.map((k) => ({ key: k, label: k })),
  ];

  const header = ["Submitted", "Overall", ...columns.map((c) => c.label), "Comments"];
  const rows = responses.map((r) => [
    r.submitted_at,
    r.overall_rating ?? "",
    ...columns.map((c) => answerText(r.answers?.[c.key])),
    r.comments ?? "",
  ]);

  return [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
}
