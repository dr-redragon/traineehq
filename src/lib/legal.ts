/**
 * Where the published policies live, and what this application actually holds.
 *
 * The Privacy Policy and Terms of Use are pages of this app (pages/PrivacyPolicy
 * and pages/TermsOfUse). The cookie policy is a section of the privacy policy
 * rather than a third document: the site sets essential storage only, and one
 * paragraph says so. Every link in the application — the landing page, the
 * sign-in page, the consent notice — reads these constants.
 *
 * The text was written from what the code does: the tables in the schema, the
 * services the edge functions call, what the browser stores. What it cannot
 * know — who the data controller is and on which lawful basis it relies — is
 * gathered in POLICY_CONTROLLER and POLICY_LAWFUL_BASIS below so it is decided
 * in one place. Have both confirmed by whoever owns information governance
 * for the programme (see docs/GO-LIVE.md 6.4), and bump POLICY_UPDATED with
 * every change to either page.
 */
export const PRIVACY_POLICY_URL = "/privacy";
export const TERMS_URL = "/terms";
export const COOKIE_POLICY_URL = "/privacy#cookies";

/** Shown at the top of both documents. */
export const POLICY_UPDATED = "11 October 2026";

/** Who is responsible for the data, as the policies name them. */
export const POLICY_CONTROLLER =
  "the TraineeHQ programme administration team, who run TraineeHQ (traineehq.com) " +
  "on behalf of the higher specialty training programmes it serves";

/**
 * The lawful basis the privacy policy states. Not consent: the consent notice
 * explains why (see GdprConsentNotice).
 */
export const POLICY_LAWFUL_BASIS =
  "our legitimate interests in organising and supporting postgraduate medical " +
  "training (UK GDPR Article 6(1)(f)) and, where the programme is run by a public " +
  "body, the performance of a task carried out in the public interest (Article 6(1)(e))";

export const hasPublishedPolicies = () => Boolean(PRIVACY_POLICY_URL);

/**
 * What is held about a person who uses this application.
 *
 * Written from the schema rather than from a template, so it can be checked
 * against the database instead of believed. It is a statement of fact about
 * what the software stores — not a privacy policy, which has to say who the
 * controller is, on what lawful basis, for how long, and who it is shared
 * with. Those are the organisation's answers to give, not the code's.
 */
export const WHAT_WE_HOLD = [
  "Your name, email address, training grade and specialty.",
  "When you signed in, and what you posted or commented on the discussion boards.",
  "If you help run a teaching register: the attendance you record for other trainees.",
] as const;

/**
 * The part that needs saying plainly rather than buried in a list.
 *
 * Absence records on a teaching register include sickness and maternity leave.
 * Under UK GDPR that is special category data — health data — and the people
 * it describes are entitled to know it is being kept before they find out by
 * accident.
 */
export const SPECIAL_CATEGORY_NOTE =
  "Teaching registers record why somebody was absent, which can include sickness " +
  "and maternity leave. That is health information, and it is held only for the " +
  "trainees on a register you help run.";
