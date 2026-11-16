import { describe, expect, it } from "vitest";
import {
  addOption, addQuestion, changeType, cloneForm, duplicateQuestion, formProblems, moveQuestion,
  questionId, removeOption, removeQuestion, setOption, updateQuestion,
} from "./formShape";
import type { FeedbackForm } from "./types";

const form = (): FeedbackForm => ({
  title: "Session feedback",
  questions: [
    { id: "content", type: "scale", text: "Relevant to my training", required: true },
    { id: "overall", type: "scale", text: "Overall?", required: true, locked: true },
  ],
});

describe("questionId", () => {
  it("makes a readable id out of the question's own words", () => {
    expect(questionId("How was the venue?", new Set())).toBe("how_was_the_venue");
  });

  it("never collides with one already in use", () => {
    expect(questionId("Venue", new Set(["venue"]))).toBe("venue_2");
  });
});

describe("addQuestion", () => {
  it("lands a new question before the locked ones at the end", () => {
    const { form: next, index } = addQuestion(form(), "short");
    expect(index).toBe(1);
    expect(next.questions.map((q) => q.id)).toEqual(["content", expect.any(String), "overall"]);
    expect(next.questions[2].locked).toBe(true);
  });

  it("fits a choice question out with two options to start from", () => {
    const { form: next, index } = addQuestion(form(), "choice");
    expect(next.questions[index].options).toHaveLength(2);
  });
});

describe("changeType", () => {
  it("gives a choice question the options it now needs", () => {
    const next = changeType(form(), 0, "checkbox");
    expect(next.questions[0].options).toEqual(["Option 1", "Option 2"]);
  });

  it("keeps the id, so answers already given are not orphaned", () => {
    expect(changeType(form(), 0, "long").questions[0].id).toBe("content");
  });

  it("keeps a built-in question built in", () => {
    expect(changeType(form(), 1, "long").questions[1].locked).toBe(true);
  });
});

describe("moveQuestion", () => {
  it("swaps a question with its neighbour", () => {
    expect(moveQuestion(form(), 0, 1).questions.map((q) => q.id)).toEqual(["overall", "content"]);
  });

  it("does nothing at either end", () => {
    expect(moveQuestion(form(), 0, -1).questions.map((q) => q.id)).toEqual(["content", "overall"]);
    expect(moveQuestion(form(), 1, 1).questions.map((q) => q.id)).toEqual(["content", "overall"]);
  });
});

describe("duplicateQuestion", () => {
  it("copies a built-in as an ordinary question, with its own id", () => {
    const next = duplicateQuestion(form(), 1);
    expect(next.questions).toHaveLength(3);
    expect(next.questions[2].locked).toBeUndefined();
    expect(next.questions[2].id).not.toBe("overall");
  });
});

describe("options", () => {
  const choice: FeedbackForm = {
    title: "t",
    questions: [{ id: "q", type: "choice", text: "Pick", required: false, options: ["A", "B"] }],
  };

  it("renames one in place", () => {
    expect(setOption(choice, 0, 1, "C").questions[0].options).toEqual(["A", "C"]);
  });

  it("adds another", () => {
    expect(addOption(choice, 0).questions[0].options).toHaveLength(3);
  });

  it("refuses to go below two — a choice of one is not a question", () => {
    expect(removeOption(choice, 0, 0).questions[0].options).toEqual(["A", "B"]);
  });
});

describe("formProblems", () => {
  it("passes a form the server would accept", () => {
    expect(formProblems(form())).toEqual([]);
  });

  it("catches a question with no text", () => {
    expect(formProblems(updateQuestion(form(), 0, { text: "  " })))
      .toEqual(["Question 1 has no text."]);
  });

  it("catches a choice question with too few options", () => {
    const bad = updateQuestion(changeType(form(), 0, "choice"), 0, { options: ["only"] });
    expect(formProblems(bad)).toEqual(["Question 1 needs at least two options."]);
  });

  it("catches an empty form", () => {
    const empty = removeQuestion(removeQuestion(form(), 1), 0);
    expect(formProblems(empty)).toContain("The form needs at least one question.");
  });
});

describe("cloneForm", () => {
  it("is a deep copy, so editing the draft cannot touch the source", () => {
    const source = form();
    const copy = cloneForm(source);
    copy.questions[0].text = "changed";
    expect(source.questions[0].text).toBe("Relevant to my training");
  });

  it("falls back to an empty form for nothing at all", () => {
    expect(cloneForm(null).questions).toEqual([]);
  });
});
