/**
 * Where the published policies live, and what this application actually holds.
 *
 * THE POLICIES DO NOT EXIST YET. That is why these are empty strings rather
 * than plausible-looking `/privacy` routes: a page that says "Privacy Policy"
 * and then describes handling nobody has approved is worse than no page at
 * all, because it tells people their data is treated in ways the organisation
 * has not actually committed to.
 *
 * Publish them, put the URLs here, and every link in the application — the
 * landing page, the sign-in page, the consent notice — becomes live at once.
 * Nothing else needs changing.
 */
export const PRIVACY_POLICY_URL = "";
export const TERMS_URL = "";
export const COOKIE_POLICY_URL = "";

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
