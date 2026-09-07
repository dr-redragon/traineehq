import type { RegisterStatus } from "./types";
import { academicYearOf, formatMonth } from "./months";

/**
 * How a long-term status reads on screen.
 *
 * Each type puts a different sentence on the same two month fields, because each
 * means something different by them: a CCT is an end, a transfer is a threshold,
 * and leave is a window that may be open at either side. Spelling that out is
 * what stops an organiser reading "Jan 2026 – Mar 2026" on a CCT row and
 * wondering what happens in April.
 *
 * The academic year is appended to every month for the same reason the register
 * is organised by academic year at all: "Aug 2026" and "Jul 2026" are eleven
 * months apart but sit in different reporting years.
 */

/**
 * The short form, for a badge beside a name.
 *
 * Every type gets its own words: "Leave" for both mat and oop would hide the
 * difference between somebody on maternity leave and somebody out of programme
 * doing a PhD, which are not the same conversation at an ARCP.
 */
export const STATUS_SHORT: Record<RegisterStatus["type"], string> = {
  active:  "Active",
  cct:     "CCT",
  mat:     "Mat leave",
  oop:     "OOP",
  idt_in:  "IDT in",
  idt_out: "IDT out",
};

export const STATUS_LABELS: Record<RegisterStatus["type"], string> = {
  active:  "Active",
  cct:     "CCT",
  mat:     "Maternity / Paternity",
  oop:     "Out of programme",
  idt_in:  "Interdeanery transfer (in)",
  idt_out: "Interdeanery transfer (out)",
};

/** The longer wording used where there is room for it, as in the type picker. */
export const STATUS_OPTIONS: { value: RegisterStatus["type"]; label: string; hint: string }[] = [
  { value: "active",  label: "Active",
    hint: "The baseline. Every teaching day counts." },
  { value: "cct",     label: "CCT — completes training",
    hint: "Teaching days after this month stop counting, in both directions." },
  { value: "mat",     label: "Maternity / paternity leave",
    hint: "A window. Leave a month empty to leave that end open." },
  { value: "oop",     label: "Out of programme (OOP / PhD)",
    hint: "A window. Leave a month empty to leave that end open." },
  { value: "idt_in",  label: "Interdeanery transfer — joins",
    hint: "Teaching days before this month do not count." },
  { value: "idt_out", label: "Interdeanery transfer — leaves",
    hint: "Teaching days from this month on do not count." },
];

function withYear(month: string): string {
  return `${formatMonth(month, "en-GB")} (${academicYearOf(month)})`;
}

export function statusRangeText(status: RegisterStatus): string {
  const { type, start, end } = status;

  if (type === "active") return "counts for every teaching day";

  // CCT is recorded by when it ends, the two transfers by when they happen —
  // hence the opposite fallbacks.
  if (type === "cct") {
    const m = end || start;
    return m ? `completes after ${withYear(m)}` : "completes (month not set)";
  }
  if (type === "idt_out") {
    const m = start || end;
    return m ? `leaves deanery from ${withYear(m)}` : "leaves deanery (month not set)";
  }
  if (type === "idt_in") {
    const m = start || end;
    return m ? `joins deanery from ${withYear(m)}` : "joins deanery (month not set)";
  }

  // mat / oop — a window, open on whichever side has no bound.
  if (start && end) return `excluded ${withYear(start)} → ${withYear(end)}`;
  if (start) return `excluded from ${withYear(start)} → ongoing`;
  if (end) return `excluded up to ${withYear(end)}, counts after`;
  return "excluded (no dates set) → ongoing";
}
