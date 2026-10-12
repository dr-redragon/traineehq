import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
// Where enquiries land: the CONTACT_FORWARD_TO secret, set in Supabase → Edge
// Functions → Secrets. Deliberately no fallback, so no address is in the source.
const FORWARD_TO = (Deno.env.get("CONTACT_FORWARD_TO") ?? "").trim();
// The address Resend sends from. Until a domain is verified at
// resend.com/domains, onboarding@resend.dev only delivers to the Resend
// account's own address and refuses every other recipient with a 403 — so set
// RESEND_FROM to an address on the verified domain ("HST Training Hub
// <noreply@example.nhs.uk>") and every function picks it up with no code change.
// Declared per function rather than shared, so each one deploys on its own.
const FROM_EMAIL = Deno.env.get("RESEND_FROM") ??
  "HST Training Hub <onboarding@resend.dev>";

// Where replies land. The sender above is a no-reply address with no mailbox
// behind it, so without this a trainee replying to their certificate gets a
// bounce. A reply-to is not a sender: it can be any ordinary mailbox — NHS,
// Gmail, anything — no matter which domain is verified in Resend. Comma- or
// space-separated; unset means no Reply-To header at all.
const REPLY_TO = (Deno.env.get("RESEND_REPLY_TO") ?? "")
  .split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
const replyTo = REPLY_TO.length ? { reply_to: REPLY_TO } : {};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// This endpoint is public and sends mail, so it is rate-limited, using the same
// outbound_email_log the access-request function uses (20261012110000):
//   * one confirmation per sender address a day — so it cannot be pointed at
//     somebody's inbox and fired repeatedly;
//   * a ceiling on enquiries per hour across the whole site, so a script cannot
//     flood the receiving inbox either.
const CONFIRMATION_KIND = "contact_confirmation";
const ENQUIRY_KIND = "contact_enquiry";
const MAX_ENQUIRIES_PER_HOUR = 30;

function service() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

async function sentSince(
  db: ReturnType<typeof service>, kind: string, hours: number, recipient?: string,
): Promise<number> {
  let q = db.from("outbound_email_log")
    .select("id", { count: "exact", head: true })
    .eq("kind", kind)
    .gte("sent_at", new Date(Date.now() - hours * 3600_000).toISOString());
  if (recipient) q = q.eq("recipient", recipient.toLowerCase());
  const { count, error } = await q;
  // Fail closed: if the limit cannot be checked, do not send.
  if (error) { console.error("outbound_email_log read failed:", error); return Number.MAX_SAFE_INTEGER; }
  return count ?? 0;
}

async function logSent(db: ReturnType<typeof service>, kind: string, recipient: string) {
  const { error } = await db.from("outbound_email_log").insert({ kind, recipient: recipient.toLowerCase() });
  if (error) console.error("outbound_email_log write failed:", error);
}
const MAX_NAME = 100;
const MAX_EMAIL = 254;
const MAX_MESSAGE = 5000;

/**
 * Escape caller-supplied text before it goes into an HTML email body.
 * Without this, anything typed into the contact form is rendered as live markup in
 * the recipient's inbox — links, images and tracking pixels included.
 */
function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escMultiline(value: string): string {
  return esc(value).replace(/\r?\n/g, "<br />");
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function sendEmail(from: string, to: string, subject: string, html: string) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({ from, to: [to], subject, html, ...replyTo }),
  });
  if (!res.ok) {
    throw new Error(`Failed to send message: ${await res.text()}`);
  }
  return res;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (!RESEND_API_KEY || !FORWARD_TO) {
      console.error("RESEND_API_KEY or CONTACT_FORWARD_TO is not configured");
      return json({ error: "Email is not configured" }, 500);
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return json({ error: "Invalid request" }, 400);
    }

    const name = String(body.name ?? "").trim();
    const email = String(body.email ?? "").trim().toLowerCase();
    const message = String(body.message ?? "").trim();

    if (!name || !email || !message) {
      return json({ error: "All fields are required" }, 400);
    }
    // This endpoint is public by necessity, so bound what it will accept: an
    // oversized or malformed submission is rejected rather than relayed.
    if (name.length > MAX_NAME) {
      return json({ error: `Name must be under ${MAX_NAME} characters` }, 400);
    }
    if (email.length > MAX_EMAIL || !EMAIL_RE.test(email)) {
      return json({ error: "Please enter a valid email address" }, 400);
    }
    if (message.length > MAX_MESSAGE) {
      return json({ error: `Message must be under ${MAX_MESSAGE} characters` }, 400);
    }

    const db = service();
    if (await sentSince(db, ENQUIRY_KIND, 1) >= MAX_ENQUIRIES_PER_HOUR) {
      return json({ error: "We are receiving a lot of messages just now. Please try again later." }, 429);
    }

    // Forward the enquiry to the inbox.
    await sendEmail(
      FROM_EMAIL,
      FORWARD_TO,
      `Contact Form: ${name.slice(0, 60)}`,
      `
        <h2>New Contact Form Message</h2>
        <p><strong>From:</strong> ${esc(name)} (${esc(email)})</p>
        <hr />
        <p>${escMultiline(message)}</p>
      `,
    );

    await logSent(db, ENQUIRY_KIND, FORWARD_TO);

    // Confirm to the sender. Best effort — the enquiry is already delivered, so a
    // bounce here must not fail the request.
    //
    // The confirmation carries nothing the caller wrote. It goes to whatever
    // address was typed, so echoing the name or message would let anybody have
    // this sender deliver text of their choosing to any inbox. And it goes at
    // most once a day per address.
    if (await sentSince(db, CONFIRMATION_KIND, 24, email) === 0) {
      try {
        await sendEmail(
          FROM_EMAIL,
          email,
          "We've received your message",
          `
            <h2>Thank you for getting in touch</h2>
            <p>We've received your message and will get back to you as soon as possible.</p>
            <p>If you did not contact the HST Training Hub, you can ignore this email.</p>
            <p style="color:#888;font-size:12px;">HST Training Hub</p>
          `,
        );
        await logSent(db, CONFIRMATION_KIND, email);
      } catch (e) {
        console.error("Confirmation email failed:", e);
      }
    }

    return json({ success: true });
  } catch (error) {
    console.error("contact-form-email error:", error);
    return json({ error: "Your message could not be sent. Please try again later." }, 500);
  }
});
