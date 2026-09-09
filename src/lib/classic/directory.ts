import type { RegisterDirectoryEntry } from "./types";

export interface GroupedDirectory {
  /** Registers the user belongs to. */
  mine: RegisterDirectoryEntry[];
  /** Registers they have asked to join and not yet heard back about. */
  awaiting: RegisterDirectoryEntry[];
  /** Everything else — the ones they could ask to join. */
  available: RegisterDirectoryEntry[];
}

/**
 * Split the directory into the three things a person can do with a register:
 * open it, wait on it, or ask for it.
 *
 * Membership wins over a pending request. The two can coexist — an owner may add
 * someone directly while their request is still outstanding — and in that case
 * the register is simply theirs; showing it as "awaiting a decision" would be
 * both wrong and alarming.
 *
 * A refused request does not hide a register or bar another attempt: refusals
 * are often "not this year" rather than "never", so it returns to `available`.
 */
export function groupDirectory(entries: RegisterDirectoryEntry[]): GroupedDirectory {
  const byName = (a: RegisterDirectoryEntry, b: RegisterDirectoryEntry) =>
    a.deanery_name.localeCompare(b.deanery_name) || a.specialty_name.localeCompare(b.specialty_name);

  return {
    mine: entries.filter((e) => e.i_am_member).sort(byName),
    awaiting: entries.filter((e) => !e.i_am_member && e.my_request === "pending").sort(byName),
    available: entries.filter((e) => !e.i_am_member && e.my_request !== "pending").sort(byName),
  };
}
