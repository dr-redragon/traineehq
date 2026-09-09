import { describe, expect, it } from "vitest";
import { feedbackThemes, mean, summariseFeedback } from "./feedbackReport";
import type { FeedbackForm, FeedbackResponse } from "./types";

const form: FeedbackForm = {
  title: "Session feedback",
  questions: [
    { id: "overall", type: "scale", text: "Overall?", required: true, locked: true },
    { id: "content", type: "scale", text: "Relevant to my training", required: true },
    { id: "topics", type: "checkbox", text: "Which topics?", required: false,
      options: ["Airway", "Otology", "Rhinology"] },
    { id: "improve", type: "long", text: "What would you change?", required: false },
  ],
};

const response = (over: Partial<FeedbackResponse> = {}): FeedbackResponse => ({
  id: "f1", session_id: "s1", overall_rating: 4,
  answers: {}, comments: null, submitted_at: "2026-02-11T16:00:00Z",
  ...over,
});

describe("mean", () => {
  it("is null for nothing at all, rather than zero", () => {
    expect(mean([])).toBeNull();
    expect(mean([4, 5])).toBe(4.5);
  });
});

describe("summariseFeedback", () => {
  it("counts the overall distribution and its average", () => {
    const summary = summariseFeedback(
      [response({ overall_rating: 5 }), response({ id: "f2", overall_rating: 3 })],
      form, 4,
    );
    expect(summary.distribution).toEqual([0, 0, 1, 0, 1]);
    expect(summary.overall).toBe(4);
    expect(summary.responses).toBe(2);
    expect(summary.responseRate).toBe(50);
  });

  it("has no response rate when nobody signed in", () => {
    expect(summariseFeedback([response()], form, 0).responseRate).toBeNull();
  });

  it("averages a scale question and counts its replies", () => {
    const summary = summariseFeedback([
      response({ answers: { content: 5 } }),
      response({ id: "f2", answers: { content: 4 } }),
      response({ id: "f3", answers: {} }),
    ], form, 3);
    expect(summary.questions).toContainEqual({
      kind: "scale", id: "content", label: "Relevant to my training", average: 4.5, count: 2,
    });
  });

  it("tallies a checkbox question, keeping options nobody picked", () => {
    const summary = summariseFeedback([
      response({ answers: { topics: ["Airway", "Otology"] } }),
      response({ id: "f2", answers: { topics: ["Airway"] } }),
    ], form, 2);
    const topics = summary.questions.find((q) => q.id === "topics");
    expect(topics).toMatchObject({ kind: "tally", count: 3 });
    expect(topics && "options" in topics && topics.options).toEqual([
      { option: "Airway", count: 2 },
      { option: "Otology", count: 1 },
      // Offered and chosen by nobody — a finding, not something to drop.
      { option: "Rhinology", count: 0 },
    ]);
  });

  it("lists free text rather than reducing it to a number", () => {
    const summary = summariseFeedback([
      response({ answers: { improve: "More cases" } }),
      response({ id: "f2", answers: { improve: "   " } }),
    ], form, 2);
    expect(summary.questions.find((q) => q.id === "improve"))
      .toMatchObject({ kind: "text", answers: ["More cases"] });
  });

  it("still reports a question since deleted from the form", () => {
    const summary = summariseFeedback(
      [response({ answers: { venue: 3 } })],
      { ...form, questions: form.questions.filter((q) => q.id !== "topics") },
      1,
    );
    // No definition, so it is labelled by its key and treated as a scale.
    expect(summary.questions.find((q) => q.id === "venue"))
      .toMatchObject({ kind: "scale", label: "venue", average: 3 });
  });

  it("reads down the page in the form's own order", () => {
    const summary = summariseFeedback(
      [response({ answers: { improve: "Later", topics: ["Airway"], content: 4 } })],
      form, 1,
    );
    expect(summary.questions.map((q) => q.id)).toEqual(["content", "topics", "improve"]);
  });

  it("keeps only the responses that actually carry a comment", () => {
    const summary = summariseFeedback([
      response({ comments: "Excellent" }),
      response({ id: "f2", comments: "  " }),
      response({ id: "f3", comments: null }),
    ], form, 3);
    expect(summary.comments.map((r) => r.id)).toEqual(["f1"]);
  });
});

describe("feedbackThemes", () => {
  it("keeps a word only when more than one comment uses it", () => {
    const themes = feedbackThemes([
      response({ comments: "The airway teaching was excellent" }),
      response({ id: "f2", comments: "More airway please" }),
      response({ id: "f3", comments: "Otology was fine" }),
    ]);
    expect(themes.map((t) => t.word)).toEqual(["airway"]);
  });

  it("counts a word once per comment, so one person cannot make a theme", () => {
    expect(feedbackThemes([
      response({ comments: "airway airway airway airway" }),
    ])).toEqual([]);
  });

  it("drops the words every comment contains anyway", () => {
    const themes = feedbackThemes([
      response({ comments: "the session was good" }),
      response({ id: "f2", comments: "the session was good" }),
    ]);
    expect(themes.map((t) => t.word)).not.toContain("the");
    expect(themes.map((t) => t.word)).not.toContain("session");
  });
});
