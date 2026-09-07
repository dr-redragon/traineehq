import { describe, expect, it } from "vitest";
import { activeStatusType, cellState, isEligible, isExcused, isFormerTrainee, isOnLeave } from "./eligibility";
import { EMPTY_REGISTER, type RegisterBlob, type RegisterStatus } from "./types";

function blobWith(status: Partial<RegisterStatus>[] = [], extra: Partial<RegisterBlob> = {}): RegisterBlob {
  return {
    ...EMPTY_REGISTER,
    trainees: [{ id: "t1", name: "A Trainee" }],
    status: status.map((s, i) => ({
      id: `st${i}`,
      trainee: "t1",
      type: "active",
      start: null,
      end: null,
      ...s,
    })) as RegisterStatus[],
    ...extra,
  };
}

describe("isEligible", () => {
  it("is eligible with no status rows at all", () => {
    expect(isEligible(blobWith(), "t1", "2026-01")).toBe(true);
  });

  it("treats an 'active' row as a no-op", () => {
    const blob = blobWith([{ type: "active", start: "2020-01" }]);
    expect(isEligible(blob, "t1", "2026-01")).toBe(true);
  });

  it("ignores another trainee's status", () => {
    const blob = blobWith([{ type: "cct", trainee: "someone-else", end: "2020-01" }]);
    expect(isEligible(blob, "t1", "2026-01")).toBe(true);
  });

  describe("cct — training ends", () => {
    it("stays eligible up to and including the CCT month", () => {
      const blob = blobWith([{ type: "cct", end: "2026-03" }]);
      expect(isEligible(blob, "t1", "2026-02")).toBe(true);
      expect(isEligible(blob, "t1", "2026-03")).toBe(true);
    });

    it("is ineligible after the CCT month", () => {
      const blob = blobWith([{ type: "cct", end: "2026-03" }]);
      expect(isEligible(blob, "t1", "2026-04")).toBe(false);
    });

    it("falls back to start when end is missing", () => {
      const blob = blobWith([{ type: "cct", start: "2026-03", end: null }]);
      expect(isEligible(blob, "t1", "2026-03")).toBe(true);
      expect(isEligible(blob, "t1", "2026-04")).toBe(false);
    });

    it("prefers end over start when both are set", () => {
      const blob = blobWith([{ type: "cct", start: "2025-01", end: "2026-03" }]);
      expect(isEligible(blob, "t1", "2025-06")).toBe(true);
      expect(isEligible(blob, "t1", "2026-04")).toBe(false);
    });

    it("does nothing with neither bound", () => {
      expect(isEligible(blobWith([{ type: "cct" }]), "t1", "2026-01")).toBe(true);
    });
  });

  describe("idt_out — transfers out of the deanery", () => {
    it("is ineligible from the transfer month onward, inclusive", () => {
      const blob = blobWith([{ type: "idt_out", start: "2026-03" }]);
      expect(isEligible(blob, "t1", "2026-02")).toBe(true);
      expect(isEligible(blob, "t1", "2026-03")).toBe(false);
      expect(isEligible(blob, "t1", "2026-04")).toBe(false);
    });

    it("falls back to end when start is missing", () => {
      const blob = blobWith([{ type: "idt_out", start: null, end: "2026-03" }]);
      expect(isEligible(blob, "t1", "2026-02")).toBe(true);
      expect(isEligible(blob, "t1", "2026-03")).toBe(false);
    });

    it("does nothing with neither bound", () => {
      expect(isEligible(blobWith([{ type: "idt_out" }]), "t1", "2026-01")).toBe(true);
    });
  });

  describe("idt_in — arrives in the deanery", () => {
    it("is ineligible before the arrival month, eligible from it", () => {
      const blob = blobWith([{ type: "idt_in", start: "2026-03" }]);
      expect(isEligible(blob, "t1", "2026-02")).toBe(false);
      expect(isEligible(blob, "t1", "2026-03")).toBe(true);
      expect(isEligible(blob, "t1", "2026-04")).toBe(true);
    });

    it("falls back to end when start is missing", () => {
      const blob = blobWith([{ type: "idt_in", start: null, end: "2026-03" }]);
      expect(isEligible(blob, "t1", "2026-02")).toBe(false);
      expect(isEligible(blob, "t1", "2026-03")).toBe(true);
    });

    it("does nothing with neither bound", () => {
      expect(isEligible(blobWith([{ type: "idt_in" }]), "t1", "2026-01")).toBe(true);
    });
  });

  describe.each(["mat", "oop"] as const)("%s — a leave window", (type) => {
    it("is ineligible across the window, both bounds inclusive", () => {
      const blob = blobWith([{ type, start: "2026-02", end: "2026-05" }]);
      expect(isEligible(blob, "t1", "2026-01")).toBe(true);
      expect(isEligible(blob, "t1", "2026-02")).toBe(false);
      expect(isEligible(blob, "t1", "2026-04")).toBe(false);
      expect(isEligible(blob, "t1", "2026-05")).toBe(false);
      expect(isEligible(blob, "t1", "2026-06")).toBe(true);
    });

    it("with a start only, is open-ended — ongoing leave", () => {
      const blob = blobWith([{ type, start: "2026-02", end: null }]);
      expect(isEligible(blob, "t1", "2026-01")).toBe(true);
      expect(isEligible(blob, "t1", "2026-02")).toBe(false);
      expect(isEligible(blob, "t1", "2099-12")).toBe(false);
    });

    it("with an end only, counts only after the return", () => {
      const blob = blobWith([{ type, start: null, end: "2026-05" }]);
      expect(isEligible(blob, "t1", "2020-01")).toBe(false);
      expect(isEligible(blob, "t1", "2026-05")).toBe(false);
      expect(isEligible(blob, "t1", "2026-06")).toBe(true);
    });

    it("with neither bound, is ongoing from the start of the register", () => {
      const blob = blobWith([{ type }]);
      expect(isEligible(blob, "t1", "2020-01")).toBe(false);
      expect(isEligible(blob, "t1", "2099-12")).toBe(false);
    });
  });

  it("takes ineligibility from any one of several rows", () => {
    // Maternity leave, returned, then CCT later. Both windows must bite.
    const blob = blobWith([
      { type: "mat", start: "2025-01", end: "2025-06" },
      { type: "cct", end: "2026-03" },
    ]);
    expect(isEligible(blob, "t1", "2024-12")).toBe(true);
    expect(isEligible(blob, "t1", "2025-03")).toBe(false);
    expect(isEligible(blob, "t1", "2025-09")).toBe(true);
    expect(isEligible(blob, "t1", "2026-04")).toBe(false);
  });
});

describe("isExcused", () => {
  const blob = blobWith([], {
    sessions: [
      { id: "s1", month: "2026-01", title: "January" },
      { id: "s2", month: "2026-02", title: "February" },
    ],
    excused: [{ id: "e1", trainee: "t1", session: "s1", reason: "On call", ts: "" }],
  });

  it("excuses the session it was logged against", () => {
    expect(isExcused(blob, "t1", "s1")).toBe(true);
  });

  it("does not excuse other sessions", () => {
    expect(isExcused(blob, "t1", "s2")).toBe(false);
  });

  it("does not excuse another trainee", () => {
    expect(isExcused(blob, "t2", "s1")).toBe(false);
  });

  it("ignores an excusal pointing at a session that no longer exists", () => {
    const orphaned = blobWith([], {
      sessions: [],
      excused: [{ id: "e1", trainee: "t1", session: "gone", reason: "", ts: "" }],
    });
    expect(isExcused(orphaned, "t1", "s1")).toBe(false);
  });

  it("excuses only the named session where a month holds two", () => {
    // The intentional change from the original, which matched on month and so
    // excused both teaching days.
    const twoInAMonth = blobWith([], {
      sessions: [
        { id: "s1", month: "2026-01", title: "First" },
        { id: "s1b", month: "2026-01", title: "Second" },
      ],
      excused: [{ id: "e1", trainee: "t1", session: "s1", reason: "", ts: "" }],
    });
    expect(isExcused(twoInAMonth, "t1", "s1")).toBe(true);
    expect(isExcused(twoInAMonth, "t1", "s1b")).toBe(false);
  });
});

describe("cellState", () => {
  const session = { id: "s1", month: "2026-01", title: "January" };

  it("reports ineligibility ahead of everything else", () => {
    const blob = blobWith([{ type: "cct", end: "2025-01" }], {
      sessions: [session],
      attendance: { "t1|s1": true },
    });
    expect(cellState(blob, "t1", session)).toBe("na");
  });

  it("reports a present mark", () => {
    const blob = blobWith([], { sessions: [session], attendance: { "t1|s1": { grade: "ST6" } } });
    expect(cellState(blob, "t1", session)).toBe("present");
  });

  it("accepts the legacy `true` mark as present", () => {
    const blob = blobWith([], { sessions: [session], attendance: { "t1|s1": true } });
    expect(cellState(blob, "t1", session)).toBe("present");
  });

  it("prefers present over excused when both are recorded", () => {
    const blob = blobWith([], {
      sessions: [session],
      attendance: { "t1|s1": true },
      excused: [{ id: "e1", trainee: "t1", session: "s1", reason: "", ts: "" }],
    });
    expect(cellState(blob, "t1", session)).toBe("present");
  });

  it("excuses only the session named, where a month holds two", () => {
    const twoInAMonth = blobWith([], {
      sessions: [
        { id: "s1", month: "2026-01", title: "First" },
        { id: "s1b", month: "2026-01", title: "Second" },
      ],
      excused: [{ id: "e1", trainee: "t1", session: "s1", reason: "", ts: "" }],
    });
    expect(cellState(twoInAMonth, "t1", { id: "s1", month: "2026-01", title: "First" }))
      .toBe("excused");
    expect(cellState(twoInAMonth, "t1", { id: "s1b", month: "2026-01", title: "Second" }))
      .toBe("absent");
  });

  it("reports excused, then absent", () => {
    const excused = blobWith([], {
      sessions: [session],
      excused: [{ id: "e1", trainee: "t1", session: "s1", reason: "", ts: "" }],
    });
    expect(cellState(excused, "t1", session)).toBe("excused");
    expect(cellState(blobWith([], { sessions: [session] }), "t1", session)).toBe("absent");
  });
});

describe("activeStatusType", () => {
  it("is null when nothing but 'active' is recorded", () => {
    expect(activeStatusType(blobWith([{ type: "active" }]), "t1", "2026-01")).toBeNull();
  });

  it("lets leave expire by itself once its end month has passed", () => {
    const blob = blobWith([{ type: "mat", start: "2025-01", end: "2025-06" }]);
    expect(activeStatusType(blob, "t1", "2025-03")?.type).toBe("mat");
    expect(activeStatusType(blob, "t1", "2025-07")).toBeNull();
  });

  it("keeps open-ended leave showing indefinitely", () => {
    const blob = blobWith([{ type: "oop", start: "2025-01", end: null }]);
    expect(activeStatusType(blob, "t1", "2099-01")?.type).toBe("oop");
  });

  it("keeps one-way departures and arrivals showing whatever the date", () => {
    expect(activeStatusType(blobWith([{ type: "cct", end: "2020-01" }]), "t1", "2099-01")?.type)
      .toBe("cct");
    expect(activeStatusType(blobWith([{ type: "idt_in", start: "2020-01" }]), "t1", "2099-01")?.type)
      .toBe("idt_in");
  });

  it("leaves the expired row in place as the record of when the leave was", () => {
    const blob = blobWith([{ type: "mat", start: "2025-01", end: "2025-06" }]);
    activeStatusType(blob, "t1", "2026-01");
    expect(blob.status).toHaveLength(1);
    expect(blob.status[0].end).toBe("2025-06");
  });
});

describe("isOnLeave", () => {
  it("is true only for mat and oop", () => {
    expect(isOnLeave(blobWith([{ type: "mat", start: "2025-01" }]), "t1", "2025-06")).toBe(true);
    expect(isOnLeave(blobWith([{ type: "oop", start: "2025-01" }]), "t1", "2025-06")).toBe(true);
    expect(isOnLeave(blobWith([{ type: "cct", end: "2025-01" }]), "t1", "2025-06")).toBe(false);
    expect(isOnLeave(blobWith([{ type: "idt_out", start: "2025-01" }]), "t1", "2025-06")).toBe(false);
    expect(isOnLeave(blobWith(), "t1", "2025-06")).toBe(false);
  });
});

describe("isFormerTrainee", () => {
  it("is true for the two one-way departures", () => {
    expect(isFormerTrainee(blobWith([{ type: "cct", end: "2025-01" }]), "t1", "2026-01")).toBe(true);
    expect(isFormerTrainee(blobWith([{ type: "idt_out", start: "2025-01" }]), "t1", "2026-01")).toBe(true);
  });

  it("is false for leave — somebody on leave is coming back", () => {
    expect(isFormerTrainee(blobWith([{ type: "mat", start: "2025-01" }]), "t1", "2025-06")).toBe(false);
    expect(isFormerTrainee(blobWith([{ type: "oop", start: "2025-01" }]), "t1", "2025-06")).toBe(false);
  });

  it("is false for an arrival, and for nothing recorded", () => {
    expect(isFormerTrainee(blobWith([{ type: "idt_in", start: "2025-01" }]), "t1", "2026-01")).toBe(false);
    expect(isFormerTrainee(blobWith(), "t1", "2026-01")).toBe(false);
    expect(isFormerTrainee(blobWith([{ type: "active" }]), "t1", "2026-01")).toBe(false);
  });

  it("stays true however long ago it was — a departure does not expire", () => {
    expect(isFormerTrainee(blobWith([{ type: "cct", end: "2000-01" }]), "t1", "2099-01")).toBe(true);
  });

  it("does not treat expired leave as a departure", () => {
    // The leave has ended, so activeStatusType returns nothing at all.
    expect(isFormerTrainee(blobWith([{ type: "mat", start: "2024-01", end: "2024-06" }]), "t1", "2026-01"))
      .toBe(false);
  });
});
