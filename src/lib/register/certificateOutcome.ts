import type { CertificateOutcome } from "./types";

/**
 * One sentence an organiser can act on, for each way issuing a certificate ends.
 *
 * A word rather than a boolean, because "nothing was sent" has half a dozen
 * different remedies and only one of them is "try again".
 */
export const CERTIFICATE_OUTCOME: Record<CertificateOutcome, (name: string) => string> = {
  sent: (name) => `Certificate emailed to ${name}.`,
  already_sent: (name) => `${name} already has their certificate.`,
  already_recorded: (name) => `${name} already has their certificate.`,
  skipped_not_checked_in: (name) =>
    `${name} has no sign-in recorded for this teaching day, so no certificate was issued.`,
  skipped_no_feedback: (name) =>
    `${name} has not given feedback yet, so no certificate was issued.`,
  skipped_no_email: (name) =>
    `The register holds no email address for ${name} — add one under Trainees & days.`,
  skipped_no_match: () =>
    "That feedback could not be matched to anybody who signed in, so no certificate was issued.",
  email_not_configured: () =>
    "Nothing sent: email is not configured yet (RESEND_API_KEY is unset).",
  failed_pdf: (name) => `The certificate for ${name} could not be drawn.`,
  failed_email: (name) => `The email to ${name} was refused — check the sending domain.`,
};
