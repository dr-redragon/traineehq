/** The grades the sign-in form offers, carried over from the standalone register. */
export const GRADES = [
  "ST3", "ST4", "ST5", "ST6", "ST7", "ST8", "Fellow", "SAS", "Other",
] as const;

/**
 * The reasons an absence is excused, carried over from the original.
 *
 * A fixed list rather than free text because these are counted and compared
 * across a cohort, and "on call" / "On-Call" / "oncall" would be three reasons.
 * "Other" opens a free-text box for the case the list does not cover.
 */
export const EXCUSAL_REASONS = [
  "Annual Leave",
  "On-call commitments",
  "Post on-call rest",
  "Sickness",
  "Study Leave (Exam/course)",
  "LTFT day",
  "Theatre commitments",
  "Emailed apology",
  "Childcare",
  "Other",
] as const;

export const OTHER_REASON = "Other";


// ---------------------------------------------------------------------------
// A register's own lists
// ---------------------------------------------------------------------------

/** How long one entry may be, and how many a list may hold. */
export const LIST_ITEM_MAX = 60;
export const LIST_MAX = 40;

/**
 * Tidy a list somebody typed: trimmed, capped, blank lines dropped, and
 * duplicates removed without regard to case ("On call" and "on call" are one
 * reason). Whatever is stored has been through this, and so has whatever is
 * read back — a list is edited by any editor of the register and is shown to
 * anonymous visitors on the sign-in form, so it is never trusted as stored.
 */
export function cleanList(items: unknown): string[] {
  if (!Array.isArray(items)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of items) {
    if (typeof raw !== "string") continue;
    const item = raw.replace(/\s+/g, " ").trim().slice(0, LIST_ITEM_MAX);
    const key = item.toLowerCase();
    if (!item || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
    if (out.length >= LIST_MAX) break;
  }
  return out;
}

type WithSettings = { settings?: { excusalReasons?: unknown; grades?: unknown } } | null | undefined;

/** The grades this register offers: its own list, or the defaults. */
export function gradesOf(source: WithSettings | { grades?: unknown }): string[] {
  const own = cleanList(
    (source as { settings?: { grades?: unknown } })?.settings?.grades
      ?? (source as { grades?: unknown })?.grades,
  );
  return own.length ? own : [...GRADES];
}

/**
 * The reasons this register offers for an excused absence. "Other" is always
 * last and cannot be removed: it is what opens the free-text box, and without
 * it a reason nobody anticipated could not be recorded at all.
 */
export function excusalReasonsOf(source: WithSettings): string[] {
  const own = cleanList(source?.settings?.excusalReasons)
    .filter((r) => r.toLowerCase() !== OTHER_REASON.toLowerCase());
  const base = own.length ? own : EXCUSAL_REASONS.filter((r) => r !== OTHER_REASON);
  return [...base, OTHER_REASON];
}
