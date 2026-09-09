import { describe, expect, it } from "vitest";
import {
  attendedPayload, describeSync, isPlaceholderEmail, mergeCheckIns, presentPayloads,
} from "./liveSync";
import { EMPTY_REGISTER, type RegisterAttendee, type RegisterBlob } from "./types";

const sessions = [{ id: "s1", month: "2026-02", title: "February teaching" }];

function blob(overrides: Partial<RegisterBlob> = {}): RegisterBlob {
  return {
    ...EMPTY_REGISTER,
    sessions,
    trainees: [
      { id: "t1", name: "Alice Adeyemi", email: "alice@nhs.net", grade: "ST6" },
      { id: "t2", name: "Bo Chen" },
    ],
    ...overrides,
  };
}

function attendee(over: Partial<RegisterAttendee> = {}): RegisterAttendee {
  return {
    id: "a1",
    name: "Alice Adeyemi",
    email: "alice@nhs.net",
    grade: "ST6",
    checked_in_at: "2026-02-11T09:00:00Z",
    feedback_completed: false,
    certificate_sent_at: null,
    ...over,
  };
}

describe("isPlaceholderEmail", () => {
  it("recognises the address invented for somebody with none on file", () => {
    expect(isPlaceholderEmail("tt2@no-email.invalid")).toBe(true);
    expect(isPlaceholderEmail("bo@nhs.net")).toBe(false);
    expect(isPlaceholderEmail(null)).toBe(false);
  });
});

describe("attendedPayload", () => {
  it("carries the grade recorded at that check-in, not today's", () => {
    const b = blob({ attendance: { "t1|s1": { grade: "ST4" } } });
    expect(attendedPayload(b, "t1", "s1")).toEqual({
      name: "Alice Adeyemi", local_trainee_id: "t1", grade: "ST4", email: "alice@nhs.net",
    });
  });

  it("falls back to the trainee's own grade when the mark carries none", () => {
    expect(attendedPayload(blob({ attendance: { "t1|s1": true } }), "t1", "s1")?.grade).toBe("ST6");
  });

  it("is null for somebody who is not on the roster", () => {
    expect(attendedPayload(blob(), "nobody", "s1")).toBeNull();
  });
});

describe("presentPayloads", () => {
  it("is everyone the grid already has down as present", () => {
    const b = blob({ attendance: { "t1|s1": { grade: "ST6" }, "t2|s1": true } });
    expect(presentPayloads(b, "s1").map((p) => p.name)).toEqual(["Alice Adeyemi", "Bo Chen"]);
  });

  it("is empty for a teaching day nobody has been marked at", () => {
    expect(presentPayloads(blob(), "s1")).toEqual([]);
  });
});

describe("mergeCheckIns", () => {
  it("adds a sign-in the grid did not have", () => {
    const result = mergeCheckIns(blob(), "s1", [attendee()]);
    expect(result.added).toBe(1);
    expect(result.blob.attendance["t1|s1"]).toEqual({ grade: "ST6" });
  });

  it("leaves a mark it already holds alone", () => {
    const b = blob({ attendance: { "t1|s1": { grade: "ST6" } } });
    const result = mergeCheckIns(b, "s1", [attendee()]);
    expect(result.added).toBe(0);
    expect(result.regraded).toBe(0);
  });

  it("takes a corrected grade from the sign-in form", () => {
    const b = blob({ attendance: { "t1|s1": { grade: "ST5" } } });
    const result = mergeCheckIns(b, "s1", [attendee({ grade: "ST6" })]);
    expect(result.regraded).toBe(1);
    expect(result.blob.attendance["t1|s1"]).toEqual({ grade: "ST6" });
  });

  it("enrols somebody who signed in under a name the roster did not hold", () => {
    const result = mergeCheckIns(blob(), "s1", [
      attendee({ id: "a2", name: "Dana Okafor", email: "dana@nhs.net", grade: "ST3" }),
    ]);
    expect(result.enrolled).toEqual(["Dana Okafor"]);
    const dana = result.blob.trainees.find((t) => t.name === "Dana Okafor");
    expect(dana).toBeTruthy();
    expect(result.blob.attendance[`${dana!.id}|s1`]).toEqual({ grade: "ST3" });
  });

  it("matches an existing trainee by name regardless of case and padding", () => {
    const result = mergeCheckIns(blob(), "s1", [attendee({ name: "  alice adeyemi " })]);
    expect(result.enrolled).toEqual([]);
    expect(result.blob.attendance["t1|s1"]).toBeTruthy();
  });

  it("backfills a missing roster address from what they typed", () => {
    const result = mergeCheckIns(blob(), "s1", [
      attendee({ id: "a2", name: "Bo Chen", email: "bo@nhs.net", grade: "ST4" }),
    ]);
    expect(result.emailed).toBe(1);
    expect(result.blob.trainees.find((t) => t.id === "t2")?.email).toBe("bo@nhs.net");
  });

  it("never writes back the undeliverable placeholder as an address", () => {
    const result = mergeCheckIns(blob(), "s1", [
      attendee({ id: "a2", name: "Bo Chen", email: "tt2@no-email.invalid" }),
    ]);
    expect(result.emailed).toBe(0);
    expect(result.blob.trainees.find((t) => t.id === "t2")?.email).toBeUndefined();
  });

  it("ignores an attendee row that was never checked in", () => {
    const result = mergeCheckIns(blob(), "s1", [attendee({ checked_in_at: null })]);
    expect(result.added).toBe(0);
    expect(result.blob.attendance).toEqual({});
  });

  it("leaves the blob it was given untouched, so a rejected save can replay it", () => {
    const before = blob();
    const snapshot = JSON.stringify(before);
    mergeCheckIns(before, "s1", [attendee({ id: "a3", name: "New Person" })]);
    expect(JSON.stringify(before)).toBe(snapshot);
  });
});

describe("describeSync", () => {
  it("says plainly when there was nothing to do", () => {
    const nothing = {
      blob: blob(), added: 0, regraded: 0, emailed: 0, enrolled: [], regraded_records: 0,
    };
    expect(describeSync(nothing, 0)).toMatch(/already matched/);
  });

  it("counts both directions", () => {
    const result = {
      blob: blob(), added: 2, regraded: 0, emailed: 1, enrolled: ["Dana Okafor"],
      regraded_records: 0,
    };
    const text = describeSync(result, 3);
    expect(text).toContain("2 sign-ins added");
    expect(text).toContain("3 marked present here are now on the live list too");
    expect(text).toContain("Dana Okafor");
  });
});
