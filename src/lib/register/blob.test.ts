import { describe, expect, it } from "vitest";
import {
  addExcusal, emptyBlob, newId, normaliseBlob, removeExcusal, removeSession, removeStatus,
  removeTrainee, setAttendance, toggleAttendance, upsertSession, upsertStatus, upsertTrainee,
} from "./blob";
import type { RegisterBlob } from "./types";

function seeded(): RegisterBlob {
  return {
    trainees: [{ id: "t1", name: "Alice" }, { id: "t2", name: "Bob" }],
    sessions: [
      { id: "s1", month: "2025-09", title: "September" },
      { id: "s2", month: "2025-10", title: "October" },
    ],
    attendance: { "t1|s1": { grade: "ST6" }, "t1|s2": true, "t2|s1": { grade: "ST4" } },
    excused: [{ id: "e1", trainee: "t1", session: "s2", reason: "On call", ts: "1" }],
    status: [{ id: "st1", trainee: "t1", type: "mat", start: "2025-01", end: null }],
  };
}

describe("normaliseBlob", () => {
  it("fills in a brand-new register's empty object", () => {
    expect(normaliseBlob({})).toEqual(emptyBlob());
  });

  it("copes with null, undefined and junk", () => {
    expect(normaliseBlob(null)).toEqual(emptyBlob());
    expect(normaliseBlob(undefined)).toEqual(emptyBlob());
    expect(normaliseBlob({ trainees: "nonsense" } as never)).toEqual(emptyBlob());
  });

  it("keeps what is already there", () => {
    const blob = seeded();
    expect(normaliseBlob(blob)).toEqual(blob);
  });

  it("fills only the missing keys", () => {
    const partial = normaliseBlob({ trainees: [{ id: "t1", name: "Alice" }] });
    expect(partial.trainees).toHaveLength(1);
    expect(partial.sessions).toEqual([]);
    expect(partial.attendance).toEqual({});
  });
});

describe("newId", () => {
  it("produces distinct ids in the original's shape", () => {
    const ids = new Set(Array.from({ length: 500 }, newId));
    expect(ids.size).toBe(500);
    expect([...ids].every((id) => /^[a-z0-9]{1,7}$/.test(id))).toBe(true);
  });
});

describe("trainees", () => {
  it("adds one without touching the rest", () => {
    const before = seeded();
    const after = upsertTrainee(before, { id: "t3", name: "Carol" });

    expect(after.trainees.map((t) => t.id)).toEqual(["t1", "t2", "t3"]);
    expect(before.trainees).toHaveLength(2);       // input untouched
  });

  it("merges an edit rather than replacing the row", () => {
    const after = upsertTrainee(seeded(), { id: "t1", name: "Alice Smith" });
    expect(after.trainees[0]).toEqual({ id: "t1", name: "Alice Smith" });
    expect(after.trainees).toHaveLength(2);
  });

  it("removing takes attendance, excusals and status with it", () => {
    const after = removeTrainee(seeded(), "t1");

    expect(after.trainees.map((t) => t.id)).toEqual(["t2"]);
    expect(Object.keys(after.attendance)).toEqual(["t2|s1"]);
    expect(after.excused).toHaveLength(0);
    expect(after.status).toHaveLength(0);
  });

  it("removing somebody who is not there changes nothing", () => {
    expect(removeTrainee(seeded(), "nobody")).toEqual(seeded());
  });

  it("does not remove a trainee whose id merely prefixes another's", () => {
    // Keys are "<trainee>|<session>", so a naive startsWith would take t1's
    // marks when removing t10 — and vice versa.
    const blob: RegisterBlob = {
      ...emptyBlob(),
      trainees: [{ id: "t1", name: "One" }, { id: "t10", name: "Ten" }],
      attendance: { "t1|s1": true, "t10|s1": true },
    };
    const after = removeTrainee(blob, "t1");

    expect(Object.keys(after.attendance)).toEqual(["t10|s1"]);
    expect(after.trainees.map((t) => t.id)).toEqual(["t10"]);
  });
});

describe("sessions", () => {
  it("adds and edits", () => {
    const added = upsertSession(seeded(), { id: "s3", month: "2025-11", title: "November" });
    expect(added.sessions).toHaveLength(3);

    const edited = upsertSession(added, { id: "s3", month: "2025-11", title: "Renamed" });
    expect(edited.sessions).toHaveLength(3);
    expect(edited.sessions[2].title).toBe("Renamed");
  });

  it("removing takes its attendance and excusals with it", () => {
    const after = removeSession(seeded(), "s2");

    expect(after.sessions.map((s) => s.id)).toEqual(["s1"]);
    expect(Object.keys(after.attendance).sort()).toEqual(["t1|s1", "t2|s1"]);
    expect(after.excused).toHaveLength(0);
  });

  it("leaves long-term status alone — it is not tied to a session", () => {
    expect(removeSession(seeded(), "s2").status).toHaveLength(1);
  });
});

describe("attendance", () => {
  it("marks present and absent", () => {
    const off = setAttendance(seeded(), "t2", "s1", false);
    expect(off.attendance["t2|s1"]).toBeUndefined();

    const on = setAttendance(off, "t2", "s1", true, "ST5");
    expect(on.attendance["t2|s1"]).toEqual({ grade: "ST5" });
  });

  it("keeps the grade from check-in when a tick is re-applied without one", () => {
    const blob = seeded();
    const same = setAttendance(blob, "t1", "s1", true);
    expect(same.attendance["t1|s1"]).toEqual({ grade: "ST6" });
  });

  it("gives a legacy `true` mark an empty grade rather than inventing one", () => {
    const after = setAttendance(seeded(), "t1", "s2", true);
    expect(after.attendance["t1|s2"]).toEqual({ grade: "" });
  });

  it("toggles both ways", () => {
    const blob = seeded();
    const off = toggleAttendance(blob, "t1", "s1");
    expect(off.attendance["t1|s1"]).toBeUndefined();
    expect(toggleAttendance(off, "t1", "s1").attendance["t1|s1"]).toEqual({ grade: "" });
  });

  it("does not mutate the blob it was given", () => {
    const blob = seeded();
    toggleAttendance(blob, "t1", "s1");
    expect(blob.attendance["t1|s1"]).toEqual({ grade: "ST6" });
  });
});

describe("excusals", () => {
  it("adds one and clears any attendance mark", () => {
    const after = addExcusal(seeded(), "t2", "s1", "  Night shift  ");

    expect(after.excused).toHaveLength(2);
    expect(after.excused[1]).toMatchObject({ trainee: "t2", session: "s1", reason: "Night shift" });
    expect(after.attendance["t2|s1"]).toBeUndefined();
  });

  it("does not duplicate an existing excusal, but still clears attendance", () => {
    const blob = setAttendance(seeded(), "t1", "s2", true);
    const after = addExcusal(blob, "t1", "s2", "Again");

    expect(after.excused).toHaveLength(1);
    expect(after.attendance["t1|s2"]).toBeUndefined();
  });

  it("removes by id", () => {
    expect(removeExcusal(seeded(), "e1").excused).toHaveLength(0);
    expect(removeExcusal(seeded(), "nope").excused).toHaveLength(1);
  });
});

describe("status", () => {
  it("adds, edits and removes", () => {
    const added = upsertStatus(seeded(), {
      id: "st2", trainee: "t2", type: "cct", start: null, end: "2026-03",
    });
    expect(added.status).toHaveLength(2);

    const edited = upsertStatus(added, {
      id: "st2", trainee: "t2", type: "cct", start: null, end: "2026-06",
    });
    expect(edited.status).toHaveLength(2);
    expect(edited.status[1].end).toBe("2026-06");

    expect(removeStatus(edited, "st2").status).toHaveLength(1);
  });
});

describe("purity", () => {
  it("no operation mutates its input — the replay-on-conflict retry depends on it", () => {
    const original = seeded();
    const snapshot = JSON.parse(JSON.stringify(original));

    upsertTrainee(original, { id: "t9", name: "New" });
    removeTrainee(original, "t1");
    upsertSession(original, { id: "s9", month: "2026-01", title: "New" });
    removeSession(original, "s1");
    setAttendance(original, "t1", "s1", false);
    toggleAttendance(original, "t2", "s2");
    addExcusal(original, "t2", "s2", "x");
    removeExcusal(original, "e1");
    upsertStatus(original, { id: "st9", trainee: "t2", type: "oop", start: "2026-01", end: null });
    removeStatus(original, "st1");

    expect(original).toEqual(snapshot);
  });
});
