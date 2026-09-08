// Email an attendance certificate to one attendee.
//
// The PDF is built in the browser and posted here already rendered. That is
// deliberate: pdf-lib is about a megabyte, and the organiser is standing in
// front of the screen when they issue these — paying that weight on a Deno cold
// start, twice (once for the download they already did, once here), to redraw a
// document the client has in its hand, buys nothing. One template, one place.
//
// THE RULE THIS FILE ENFORCES: the address is taken from the database, never
// from the request. A caller supplies a session and an attendee id; where the
// certificate goes is looked up. Otherwise this would be an authenticated
// open relay — send anything, to anyone, from the training hub's sender.
//
// The caller must be a member of the register that owns the session. The
// service role bypasses row-level security, so that check happens here in code
// or it does not happen at all.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const RESEND_API = "https://api.resend.com/emails";
const FROM_EMAIL = "HST Training Hub <onboarding@resend.dev>";

// Marks a trainee the register holds no address for. register-api invents these
// so somebody with no email can still be marked present; nothing can be sent.
const NO_EMAIL_DOMAIN = "@no-email.invalid";

// A certificate is a few kilobytes. Anything approaching a megabyte is not one.
const MAX_PDF_BYTES = 2 * 1024 * 1024;

function certificateHtml(name: string, sessionTitle: string, registerName: string) {
  return `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px">
      <h2 style="color:#1a1a2e;margin-bottom:16px">Your certificate of attendance</h2>
      <p style="color:#4a4a5a;line-height:1.6">Dear ${name},</p>
      <p style="color:#4a4a5a;line-height:1.6">
        Thank you for attending <strong>${sessionTitle}</strong> and for completing the
        feedback form. Your certificate of attendance is attached.
      </p>
      <p style="color:#8a8a9a;font-size:13px;margin-top:32px">— ${registerName}</p>
    </div>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    // ---------------------------------------------------------- the caller --
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    if (!token) return json({ error: "Not authenticated" }, 401);

    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    const caller = userData?.user;
    if (userErr || !caller) return json({ error: "Not authenticated" }, 401);

    const body = await req.json();
    const sessionId = String(body.session_id ?? "");
    const attendeeId = String(body.attendee_id ?? "");
    const pdfBase64 = String(body.pdf_base64 ?? "");

    if (!sessionId || !attendeeId) return json({ error: "Missing session or attendee" }, 400);
    if (!pdfBase64) return json({ error: "Missing certificate" }, 400);
    // base64 is 4 characters per 3 bytes.
    if (pdfBase64.length * 3 / 4 > MAX_PDF_BYTES) {
      return json({ error: "That certificate is too large" }, 413);
    }

    // --------------------------------------------------------- the session --
    const { data: session } = await admin
      .from("register_sessions")
      .select("id, register_id, title")
      .eq("id", sessionId)
      .maybeSingle();

    if (!session) return json({ error: "Unknown session" }, 404);

    const { data: membership } = await admin
      .from("register_members")
      .select("user_id")
      .eq("register_id", session.register_id)
      .eq("user_id", caller.id)
      .maybeSingle();

    if (!membership) {
      return json({ error: "You do not have access to that register" }, 403);
    }

    // -------------------------------------------------------- the attendee --
    // Constrained to this session, so an attendee id from another register
    // cannot be paired with a session the caller does happen to hold.
    const { data: attendee } = await admin
      .from("register_attendees")
      .select("id, name, email, feedback_completed")
      .eq("id", attendeeId)
      .eq("session_id", sessionId)
      .maybeSingle();

    if (!attendee) return json({ error: "That person is not on this session" }, 404);

    if (attendee.email.endsWith(NO_EMAIL_DOMAIN)) {
      return json({ error: `The register holds no email address for ${attendee.name}` }, 422);
    }

    const { data: register } = await admin
      .from("registers").select("name").eq("id", session.register_id).maybeSingle();
    const registerName = register?.name ?? "Teaching register";

    // ---------------------------------------------------------------- send --
    const key = Deno.env.get("RESEND_API_KEY");
    if (!key) {
      // Said plainly rather than as a 500: this is a configuration step
      // somebody still has to do, not a fault in the request.
      return json({ error: "Email is not configured yet (RESEND_API_KEY is not set)." }, 503);
    }

    const res = await fetch(RESEND_API, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [attendee.email],
        subject: `Your certificate — ${session.title}`,
        html: certificateHtml(attendee.name, session.title, registerName),
        attachments: [{
          filename: "certificate.pdf",
          content: pdfBase64,
        }],
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      console.error("Resend rejected the certificate:", res.status, detail);
      return json({ error: `The email service refused it (${res.status})` }, 502);
    }

    // Recorded only once it has actually gone, so a failed send can be retried
    // rather than looking like it succeeded.
    await admin
      .from("register_attendees")
      .update({ certificate_sent_at: new Date().toISOString() })
      .eq("id", attendee.id);

    return json({ success: true, sent_to: attendee.name });
  } catch (error) {
    console.error("register-certificate error:", error);
    return json({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});
