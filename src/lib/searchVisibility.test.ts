import { describe, it, expect } from "vitest";

import {
  isVisibleForSpecialty, keepVisible, matchesTerm, toVisibleIdSet,
} from "./searchVisibility";

/**
 * The scope a trainee gets: two specialties they are assigned to and that are
 * still switched on. "ent-withdrawn" is the one an admin has deactivated — the
 * database still hands them its rows, so it is the client's job to drop it.
 */
const visible = toVisibleIdSet([{ id: "sp-urology" }, { id: "sp-vascular" }]);

describe("toVisibleIdSet", () => {
  it("is empty when the scope has not loaded", () => {
    expect(toVisibleIdSet(undefined).size).toBe(0);
  });
});

describe("isVisibleForSpecialty", () => {
  it("passes a specialty in scope", () => {
    expect(isVisibleForSpecialty("sp-urology", visible)).toBe(true);
  });

  it("drops a withdrawn or out-of-deanery specialty", () => {
    expect(isVisibleForSpecialty("ent-withdrawn", visible)).toBe(false);
  });

  it("drops a row with no specialty by default, rather than letting it through", () => {
    expect(isVisibleForSpecialty(null, visible)).toBe(false);
    expect(isVisibleForSpecialty(undefined, visible)).toBe(false);
  });

  it("keeps an unscoped row only where that is asked for", () => {
    expect(isVisibleForSpecialty(null, visible, { allowUnscoped: true })).toBe(true);
  });

  it("lets nothing through on an empty scope", () => {
    const none = toVisibleIdSet([]);
    expect(isVisibleForSpecialty("sp-urology", none)).toBe(false);
  });
});

describe("keepVisible", () => {
  it("keeps a file in a section of a visible specialty and drops one that is not", () => {
    const resources = [
      { id: "r-1", subsections: { specialty_id: "sp-urology" } },
      { id: "r-2", subsections: { specialty_id: "ent-withdrawn" } },
      { id: "r-3", subsections: { specialty_id: "sp-vascular" } },
    ];
    const kept = keepVisible(resources, (r) => r.subsections.specialty_id, visible);
    expect(kept.map((r) => r.id)).toEqual(["r-1", "r-3"]);
  });

  it("drops a file whose section did not come back, rather than assuming access", () => {
    const orphan = [{ id: "r-4", subsections: undefined as { specialty_id: string } | undefined }];
    expect(keepVisible(orphan, (r) => r.subsections?.specialty_id, visible)).toEqual([]);
  });

  it("drops a thread in a withdrawn specialty", () => {
    const threads = [
      { id: "d-1", specialty_id: "sp-urology" },
      { id: "d-2", specialty_id: "ent-withdrawn" },
    ];
    expect(keepVisible(threads, (d) => d.specialty_id, visible).map((d) => d.id)).toEqual(["d-1"]);
  });

  it("keeps a general contact but still drops one from a withdrawn specialty", () => {
    const contacts = [
      { id: "c-1", specialty_id: null },
      { id: "c-2", specialty_id: "ent-withdrawn" },
      { id: "c-3", specialty_id: "sp-vascular" },
    ];
    const kept = keepVisible(contacts, (c) => c.specialty_id, visible, { allowUnscoped: true });
    expect(kept.map((c) => c.id)).toEqual(["c-1", "c-3"]);
  });

  it("returns nothing for an empty scope, whatever came back", () => {
    const rows = [{ id: "r-1", specialty_id: "sp-urology" }];
    expect(keepVisible(rows, (r) => r.specialty_id, toVisibleIdSet([]))).toEqual([]);
  });

  it("copes with no rows at all", () => {
    expect(keepVisible(undefined, (r: { specialty_id: string }) => r.specialty_id, visible)).toEqual([]);
  });

  it("keeps the order it was given", () => {
    const rows = [
      { id: "b", specialty_id: "sp-vascular" },
      { id: "a", specialty_id: "sp-urology" },
    ];
    expect(keepVisible(rows, (r) => r.specialty_id, visible).map((r) => r.id)).toEqual(["b", "a"]);
  });
});

describe("matchesTerm", () => {
  it("matches part of a word, ignoring case, like the database does", () => {
    expect(matchesTerm("urol", "Urology", "Urological surgery")).toBe(true);
    expect(matchesTerm("UROL", "Urology")).toBe(true);
  });

  it("matches on any of the fields given", () => {
    expect(matchesTerm("surgery", "Vasc", "Vascular surgery")).toBe(true);
  });

  it("does not match a term that is absent", () => {
    expect(matchesTerm("cardio", "Urology", "Urological surgery")).toBe(false);
  });

  it("treats an empty or blank term as no match, so it cannot select everything", () => {
    expect(matchesTerm("", "Urology")).toBe(false);
    expect(matchesTerm("   ", "Urology")).toBe(false);
  });

  it("copes with missing fields", () => {
    expect(matchesTerm("urol", null, undefined, "Urology")).toBe(true);
    expect(matchesTerm("urol", null, undefined)).toBe(false);
  });
});
