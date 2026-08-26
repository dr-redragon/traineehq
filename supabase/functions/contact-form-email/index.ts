import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FORWARD_TO = "mohammedabdelaziz12@gmail.com";
const FROM_EMAIL = "onboarding@resend.dev";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { name, email, message } = await req.json();

    if (!name || !email || !message) {
      return new Response(JSON.stringify({ error: "All fields are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Forward message to admin
    const forwardRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: `NW HST Hub <${FROM_EMAIL}>`,
        to: [FORWARD_TO],
        subject: `Contact Form: ${name}`,
        html: `
          <h2>New Contact Form Message</h2>
          <p><strong>From:</strong> ${name} (${email})</p>
          <hr />
          <p>${message.replace(/\n/g, "<br />")}</p>
        `,
      }),
    });

    if (!forwardRes.ok) {
      const err = await forwardRes.text();
      throw new Error(`Failed to forward message: ${err}`);
    }

    // Send confirmation to sender
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: `NW HST Training Hub <${FROM_EMAIL}>`,
        to: [email],
        subject: "We've received your message",
        html: `
          <h2>Thank you for getting in touch, ${name}!</h2>
          <p>We've received your message and will get back to you as soon as possible.</p>
          <hr />
          <p><strong>Your message:</strong></p>
          <p>${message.replace(/\n/g, "<br />")}</p>
          <br />
          <p style="color:#888;font-size:12px;">North West HST Training Hub</p>
        `,
      }),
    });

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
