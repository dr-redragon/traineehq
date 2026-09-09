import { describe, expect, it } from "vitest";
import { groupDirectory } from "./directory";
import type { RegisterDirectoryEntry, RequestStatus } from "./types";

function entry(
  overrides: Partial<RegisterDirectoryEntry> & { slug: string },
): RegisterDirectoryEntry {
  return {
    id: overrides.slug,
    name: overrides.slug,
    deanery_name: "Mersey",
    specialty_name: "ENT",
    member_count: 1,
    i_am_member: false,
    i_am_owner: false,
    certificate_logo_path: null,
    my_request: null,
    ...overrides,
  };
}

describe("groupDirectory", () => {
  it("puts classic_registers you belong to under `mine`", () => {
    const { mine, awaiting, available } = groupDirectory([
      entry({ slug: "a", i_am_member: true }),
      entry({ slug: "b" }),
    ]);

    expect(mine.map((e) => e.slug)).toEqual(["a"]);
    expect(awaiting).toHaveLength(0);
    expect(available.map((e) => e.slug)).toEqual(["b"]);
  });

  it("separates a request still waiting on a decision", () => {
    const { awaiting, available } = groupDirectory([
      entry({ slug: "a", my_request: "pending" }),
      entry({ slug: "b" }),
    ]);

    expect(awaiting.map((e) => e.slug)).toEqual(["a"]);
    expect(available.map((e) => e.slug)).toEqual(["b"]);
  });

  it("treats membership as settling it, even with a request outstanding", () => {
    // An owner can add somebody directly while their request is still open.
    const { mine, awaiting } = groupDirectory([
      entry({ slug: "a", i_am_member: true, my_request: "pending" }),
    ]);

    expect(mine.map((e) => e.slug)).toEqual(["a"]);
    expect(awaiting).toHaveLength(0);
  });

  it("lets a refused register be asked for again", () => {
    const { available, awaiting } = groupDirectory([entry({ slug: "a", my_request: "rejected" })]);

    expect(available.map((e) => e.slug)).toEqual(["a"]);
    expect(awaiting).toHaveLength(0);
  });

  it("does not strand an approved request that has not become membership", () => {
    // Approval inserts the membership row in the same transaction, so this
    // should not happen — but if it ever did, the register must stay reachable
    // rather than vanishing from every list.
    const { mine, awaiting, available } = groupDirectory([
      entry({ slug: "a", my_request: "approved", i_am_member: false }),
    ]);

    expect(mine).toHaveLength(0);
    expect(awaiting).toHaveLength(0);
    expect(available.map((e) => e.slug)).toEqual(["a"]);
  });

  it("orders by deanery, then specialty", () => {
    const { available } = groupDirectory([
      entry({ slug: "c", deanery_name: "Wessex", specialty_name: "ENT" }),
      entry({ slug: "b", deanery_name: "Mersey", specialty_name: "Urology" }),
      entry({ slug: "a", deanery_name: "Mersey", specialty_name: "ENT" }),
    ]);

    expect(available.map((e) => e.slug)).toEqual(["a", "b", "c"]);
  });

  it("handles an empty directory", () => {
    const grouped = groupDirectory([]);
    expect(grouped).toEqual({ mine: [], awaiting: [], available: [] });
  });

  it("covers every request status", () => {
    const statuses: (RequestStatus | null)[] = ["pending", "approved", "rejected", null];
    const grouped = groupDirectory(
      statuses.map((s, i) => entry({ slug: `s${i}`, my_request: s })),
    );

    expect(
      grouped.mine.length + grouped.awaiting.length + grouped.available.length,
    ).toBe(statuses.length);
  });
});
