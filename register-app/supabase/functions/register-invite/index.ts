// Email an invitation that already exists.
//
// The invitation is made by the invite_to_register() RPC, which is where the
// "only an owner may invite" rule lives. This function only sends the email —
// so if no mail provider is configured, or the send fails, the invitation is
// still good and the owner still has its link to pass on themselves.
//
// It cannot be used as a relay: the caller names an invitation id, and the
// recipient, the register and the link all come from the database row. The
// caller must be an owner of that invitation's register.
import { appBaseUrl, caller, CORS, json, service } from "../_shared/http.ts";
import { esc, paragraph, renderEmail } from "../_shared/email-layout.ts";

const RESEND_API = "https://api.resend.com/emails";
const FROM = Deno.env.get("RESEND_FROM") ?? "The Register <onboarding@resend.dev>";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  try {
    const db = service();
    const user = await caller(req, db);
    if (!user) return json({ error: "Please sign in first" }, 401);

    const body = await req.json().catch(() => ({}));
    const inviteId = String(body.invite_id ?? "");

    const { data: invite } = await db.from("register_invites")
      .select("id, register_id, email, role, token, accepted_at, expires_at")
      .eq("id", inviteId).maybeSingle();
    if (!invite || invite.accepted_at) return json({ error: "Unknown invitation" }, 404);

    const { data: membership } = await db.from("register_members")
      .select("role").eq("register_id", invite.register_id).eq("user_id", user.id).maybeSingle();
    if (membership?.role !== "owner") {
      return json({ error: "Only an owner can invite people to this register" }, 403);
    }

    const apiKey = Deno.env.get("RESEND_API_KEY");
    if (!apiKey) return json({ sent: false, reason: "email_not_configured" });

    const [{ data: register }, { data: profile }] = await Promise.all([
      db.from("registers").select("name, organisation, kind").eq("id", invite.register_id).single(),
      db.from("profiles").select("first_name, last_name").eq("user_id", user.id).maybeSingle(),
    ]);

    const inviter = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ").trim()
      || user.email || "A colleague";
    const registerName = register?.name ?? "a register";
    const what = register?.kind === "event" ? "event register" : "teaching register";
    const link = `${appBaseUrl()}/invite/${invite.token}`;

    const html = renderEmail({
      kicker: "Invitation",
      heading: `Help run ${registerName}`,
      preheader: `${inviter} has invited you to ${registerName}.`,
      body:
        paragraph(`<strong>${esc(inviter)}</strong> has invited you to help run the ${what} ` +
          `<strong>${esc(registerName)}</strong>` +
          (register?.organisation ? ` for ${esc(register.organisation)}` : "") +
          ` as ${invite.role === "owner" ? "an owner" : "an editor"}.`) +
        paragraph("Open the link and sign in with Google, Apple or your NHSmail account. " +
          "It is free for you, and the link works for 14 days."),
      button: { label: "Accept invitation", url: link },
      reason: `You're receiving this because ${inviter} entered your address to invite you. ` +
        "If you were not expecting it, you can ignore this email.",
    });

    const res = await fetch(RESEND_API, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM,
        to: [invite.email],
        subject: `${inviter} invited you to ${registerName}`,
        html,
      }),
    });

    if (!res.ok) {
      console.error("register-invite: resend refused", res.status, await res.text());
      return json({ sent: false, reason: "send_failed" });
    }
    return json({ sent: true });
  } catch (err) {
    console.error("register-invite", err);
    return json({ sent: false, reason: "error" });
  }
});
