import { describe, expect, it } from "vitest";
import { csvCell, feedbackCsv } from "./feedbackCsv";
import type { FeedbackForm, FeedbackResponse } from "./types";

const form: FeedbackForm = {
  title: "Session feedback",
  questions: [
    { id: "overall", type: "scale", text: "Overall?", required: true, locked: true },
    { id: "content", type: "scale", text: "Relevant?", required: true },
    { id: "topics", type: "checkbox", text: "Which topics?", required: false,
      options: ["Airway", "Otology"] },
  ],
};

const response = (over: Partial<FeedbackResponse> = {}): FeedbackResponse => ({
  id: "f1",
  session_id: "s1",
  overall_rating: 4,
  answers: { content: 5, topics: ["Airway", "Otology"] },
  comments: null,
  submitted_at: "2026-02-11T16:00:00Z",
  ...over,
});

describe("csvCell", () => {
  it("leaves an ordinary value alone", () => {
    expect(csvCell("Airway")).toBe("Airway");
  });

  it("quotes and doubles up anything that would break a row", () => {
    expect(csvCell('He said "yes", loudly')).toBe('"He said ""yes"", loudly"');
    expect(csvCell("two\nlines")).toBe('"two\nlines"');
  });

  it("renders nothing at all as an empty cell", () => {
    expect(csvCell(null)).toBe("");
  });
});

describe("feedbackCsv", () => {
  it("uses the form's own question order and wording as the header", () => {
    const [header] = feedbackCsv([response()], form).split("\n");
    expect(header).toBe("Submitted,Overall,Relevant?,Which topics?,Comments");
  });

  it("joins a multi-answer question into one cell", () => {
    const [, row] = feedbackCsv([response()], form).split("\n");
    expect(row).toContain("Airway; Otology");
  });

  it("still exports an answer to a question since deleted from the form", () => {
    const csv = feedbackCsv(
      [response({ answers: { content: 5, venue: "Cold" } })],
      { ...form, questions: form.questions.filter((q) => q.id !== "topics") },
    );
    expect(csv.split("\n")[0]).toBe("Submitted,Overall,Relevant?,venue,Comments");
    expect(csv.split("\n")[1]).toContain("Cold");
  });

  it("is a header on its own when nobody has answered", () => {
    expect(feedbackCsv([], form).split("\n")).toHaveLength(1);
  });

  it("copes with no form at all", () => {
    expect(feedbackCsv([response()], null).split("\n")[0])
      .toBe("Submitted,Overall,content,topics,Comments");
  });
});
