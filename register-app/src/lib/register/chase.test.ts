import { describe, expect, it } from "vitest";
import { defaultChaseBody, defaultChaseSubject, splitByEmail, unexplainedAbsentees } from "./chase";
import { EMPTY_REGISTER, type RegisterBlob } from "./types";

const session = { id: "s1", month: "2026-02", title: "February teaching" };

function blob(overrides: Partial<RegisterBlob> = {}): RegisterBlob {
  return {
    ...EMPTY_REGISTER,
    sessions: [session],
    trainees: [
      { id: "t1", name: "Alice Adeyemi", email: "alice@nhs.net" },
      { id: "t2", name: "Bo Chen", email: "bo@nhs.net" },
      { id: "t3", name: "Dana Okafor" },
    ],
    ...overrides,
  };
}

describe("unexplainedAbsentees", () => {
  it("is everyone eligible who is neither present nor excused", () => {
    const b = blob({ attendance: { "t1|s1": true } });
    expect(unexplainedAbsentees(b, session).map((t) => t.name))
      .toEqual(["Bo Chen", "Dana Okafor"]);
  });

  it("leaves out anybody with an excuse recorded", () => {
    const b = blob({
      excused: [{ id: "e1", trainee: "t2", session: "s1", reason: "Annual Leave", ts: "0" }],
    });
    expect(unexplainedAbsentees(b, session).map((t) => t.name))
      .toEqual(["Alice Adeyemi", "Dana Okafor"]);
  });

  it("leaves out anybody the day was never theirs to attend", () => {
    // CCT'd before this teaching day: not absent, simply gone.
    const b = blob({
      status: [{ id: "st1", trainee: "t1", type: "cct", start: "2025-08", end: null }],
    });
    expect(unexplainedAbsentees(b, session).map((t) => t.name))
      .toEqual(["Bo Chen", "Dana Okafor"]);
  });

  it("is empty without a teaching day to ask about", () => {
    expect(unexplainedAbsentees(blob(), undefined)).toEqual([]);
  });
});

describe("splitByEmail", () => {
  it("separates the people who can be written to from the ones who cannot", () => {
    const { withEmail, withoutEmail } = splitByEmail(unexplainedAbsentees(blob(), session));
    expect(withEmail.map((t) => t.name)).toEqual(["Alice Adeyemi", "Bo Chen"]);
    expect(withoutEmail.map((t) => t.name)).toEqual(["Dana Okafor"]);
  });

  it("treats a whitespace-only address as no address", () => {
    const { withoutEmail } = splitByEmail([{ id: "x", name: "Blank", email: "   " }]);
    expect(withoutEmail).toHaveLength(1);
  });
});

describe("the draft", () => {
  it("names the teaching day in the subject", () => {
    expect(defaultChaseSubject(session)).toContain("February teaching");
  });

  it("offers a way to say the register is wrong", () => {
    expect(defaultChaseBody(session)).toContain("If you were there");
  });

  it("signs off as the register when it has a name", () => {
    expect(defaultChaseBody(session, "North West ENT")).toContain("North West ENT");
  });
});
