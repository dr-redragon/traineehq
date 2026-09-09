import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
// Where enquiries land. Set CONTACT_FORWARD_TO in the function's environment so the
// destination address isn't baked into the source.
const FORWARD_TO = Deno.env.get("CONTACT_FORWARD_TO") ?? "mohammedabdelaziz12@gmail.com";
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
    if (!RESEND_API_KEY) {
      console.error("RESEND_API_KEY is not configured");
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

    // Confirm to the sender. Best effort — the enquiry is already delivered, so a
    // bounce here must not fail the request.
    try {
      await sendEmail(
        FROM_EMAIL,
        email,
        "We've received your message",
        `
          <h2>Thank you for getting in touch, ${esc(name)}!</h2>
          <p>We've received your message and will get back to you as soon as possible.</p>
          <hr />
          <p><strong>Your message:</strong></p>
          <p>${escMultiline(message)}</p>
          <br />
          <p style="color:#888;font-size:12px;">North West HST Training Hub</p>
        `,
      );
    } catch (e) {
      console.error("Confirmation email failed:", e);
    }

    return json({ success: true });
  } catch (error) {
    console.error("contact-form-email error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return json({ error: message }, 500);
  }
});
