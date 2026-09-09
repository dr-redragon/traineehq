// The only place register-api talks to an email provider.
//
// Declared inside this function rather than in `_shared`, matching the
// convention the other functions here follow: each one deploys on its own, and
// a shared module would make deploying one of them a decision about all of
// them. Swapping Resend for SendGrid, Postmark or an institutional relay means
// rewriting this file and nothing else.

export interface EmailMessage {
  to: string;
  /** Used by the chaser, so recipients cannot see one another. */
  bcc?: string[];
  /** Overrides RESEND_REPLY_TO for this one message. */
  replyTo?: string[];
  subject: string;
  html: string;
  text?: string;
}

// The failures worth telling an organiser apart. Everything else is "provider".
export type EmailFailure =
  | "not_configured"
  | "sandbox_domain"
  | "domain_not_verified"
  | "invalid_address"
  | "rate_limited"
  | "provider"
  | "network";

export interface EmailResult {
  ok: boolean;
  id?: string;
  error?: string;
  reason?: EmailFailure;
}

const RESEND_API = "https://api.resend.com/emails";

export function emailConfigured(): boolean {
  return !!Deno.env.get("RESEND_API_KEY");
}

/**
 * The sender, as the other functions in this project declare it: RESEND_FROM
 * carries the whole `Name <address>` form. Split back out because Resend
 * classifies failures by the bare address and the UI quotes it at the organiser.
 */
export function fromAddress(): string {
  return (Deno.env.get("RESEND_FROM") ?? "HST Training Hub <onboarding@resend.dev>").trim();
}

export function fromEmail(): string {
  const match = fromAddress().match(/<([^>]+)>/);
  return (match ? match[1] : fromAddress()).trim();
}

/**
 * Where replies land. The sender is a no-reply address with no mailbox behind
 * it, so without this a trainee replying gets a bounce. A reply-to is not a
 * sender: it can be any ordinary mailbox on any domain.
 */
export function replyToAddresses(): string[] {
  return (Deno.env.get("RESEND_REPLY_TO") ?? "")
    .split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
}

/**
 * True while the sender is still Resend's shared test address, which delivers
 * ONLY to the Resend account holder. Every other recipient silently gets
 * nothing, so it is worth saying out loud rather than reporting a success.
 */
export function usingSandboxSender(): boolean {
  return /@resend\.dev$/i.test(fromEmail());
}

function classify(status: number, message: string): EmailFailure {
  const m = message.toLowerCase();
  // Order matters: an unverified real domain also says "verify a domain", so it
  // has to be ruled out before the shared-test-address case.
  if (m.includes("not verified") || m.includes("verify a domain")) return "domain_not_verified";
  if (m.includes("testing emails to your own")) return "sandbox_domain";
  if (m.includes("invalid") && m.includes("email")) return "invalid_address";
  if (status === 429) return "rate_limited";
  return "provider";
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Resend's free tier allows 2 requests a second. A teaching day with thirty
// trainees pushed at once runs straight into 429s and silently drops most of
// them, which reads as "some people just didn't get it". Space the calls out,
// and wait a 429 out rather than counting it as a failure.
let nextSlot = 0;
const MIN_GAP_MS = 550;

async function throttle() {
  const now = Date.now();
  const wait = Math.max(0, nextSlot - now);
  nextSlot = Math.max(now, nextSlot) + MIN_GAP_MS;
  if (wait) await sleep(wait);
}

export async function sendEmail(message: EmailMessage): Promise<EmailResult> {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return { ok: false, reason: "not_configured", error: "email_not_configured" };

  const body: Record<string, unknown> = {
    from: fromAddress(),
    to: [message.to],
    subject: message.subject,
    html: message.html,
  };
  if (message.bcc?.length) body.bcc = message.bcc;
  if (message.text) body.text = message.text;
  const replyTo = message.replyTo?.length ? message.replyTo : replyToAddresses();
  if (replyTo.length) body.reply_to = replyTo;

  for (let attempt = 0; attempt < 3; attempt++) {
    await throttle();
    try {
      const res = await fetch(RESEND_API, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await res.json().catch(() => ({}));
      if (res.ok) return { ok: true, id: payload?.id };

      const msg = payload?.message || payload?.error?.message || `provider_error_${res.status}`;
      const reason = classify(res.status, String(msg));
      if (reason === "rate_limited" && attempt < 2) {
        await sleep(1200 * (attempt + 1));
        continue;
      }
      return { ok: false, error: String(msg), reason };
    } catch (err) {
      if (attempt < 2) { await sleep(600 * (attempt + 1)); continue; }
      return { ok: false, error: String(err), reason: "network" };
    }
  }
  return { ok: false, error: "send_failed", reason: "provider" };
}

/** One sentence an organiser can act on, for each way a send can fail. */
export function explainFailure(reason: EmailFailure | undefined, from = fromEmail()): string {
  switch (reason) {
    case "not_configured":
      return "Email is not configured yet — set RESEND_API_KEY in Supabase → Edge Functions → Secrets.";
    case "sandbox_domain":
      return `Resend is still sending as ${from}, its shared test address, which only delivers to the ` +
             "Resend account holder. Verify your own domain in Resend and set RESEND_FROM to an " +
             "address at it — until then trainees receive nothing.";
    case "domain_not_verified":
      return `The domain on ${from} is not verified in Resend yet, so it will not send. ` +
             "Finish the DNS records Resend lists under Domains.";
    case "invalid_address":
      return "That address was rejected as invalid — check it under Trainees & days.";
    case "rate_limited":
      return "Resend rate-limited the send even after retrying. Try the rest again in a minute.";
    case "network":
      return "Could not reach Resend. Check the connection and try again.";
    default:
      return "The email provider rejected the message.";
  }
}
