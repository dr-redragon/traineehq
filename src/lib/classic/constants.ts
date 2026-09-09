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
