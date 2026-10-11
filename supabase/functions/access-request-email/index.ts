import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const RESEND_API = "https://api.resend.com/emails";
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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MAX_NAME = 200;
const MAX_NOTE = 2000;

interface EmailPayload {
  type:
    | "submission_confirmation" | "new_request_alert" | "approved" | "rejected"
    | "specialty_request_submitted" | "specialty_request_decided";
  /** The specialty_access_requests row, for the two specialty_request_* types. */
  request_id?: string;
  applicant_email: string;
  applicant_name: string;
  specialty_name?: string;
  specialty_id?: string;
  deanery_id?: string;
  training_grade?: string;
  review_note?: string;
}

function getSupabaseAdmin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

/** Escape anything interpolated into an email body — all of it is caller-supplied. */
function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * Resolve the caller and confirm they may review access requests.
 *
 * Approving a request provisions a real account, so it must never be reachable with
 * the anon key alone — the caller has to present their own JWT and hold a reviewing
 * role. Returns null when the caller is not permitted.
 */
async function getReviewer(
  admin: ReturnType<typeof getSupabaseAdmin>,
  req: Request,
): Promise<{ id: string } | null> {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;

  const { data: userData, error } = await admin.auth.getUser(token);
  const caller = userData?.user;
  if (error || !caller) return null;

  const { data: roles } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", caller.id);

  const permitted = (roles ?? []).some((r: { role: string }) =>
    ["super_admin", "admin", "facilitator"].includes(r.role)
  );
  return permitted ? { id: caller.id } : null;
}

async function sendEmail(to: string, subject: string, html: string) {
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY is not configured");

  const res = await fetch(RESEND_API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: FROM_EMAIL, to: [to], subject, html, ...replyTo }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend API error [${res.status}]: ${body}`);
  }
  return res.json();
}

/** The caller's user id from their JWT, or null. */
async function getCallerId(
  admin: ReturnType<typeof getSupabaseAdmin>,
  req: Request,
): Promise<string | null> {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  return error || !data?.user ? null : data.user.id;
}

function specialtyRequestAlertHtml(
  name: string, email: string, specialty: string, reason: string | null, siteUrl: string,
) {
  return `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px">
      <h2 style="color:#1a1a2e;margin-bottom:16px">Specialty Access Request</h2>
      <p style="color:#4a4a5a;line-height:1.6">
        <strong>${esc(name)}</strong> (${esc(email)}) has asked to join <strong>${esc(specialty)}</strong>.
      </p>
      ${reason ? `<p style="color:#4a4a5a;line-height:1.6;background:#f8f8fc;padding:12px 16px;border-radius:8px;border-left:3px solid #ccc"><em>${esc(reason)}</em></p>` : ""}
      <p style="color:#4a4a5a;line-height:1.6">
        Review it in the Admin Panel or Facilitator Panel${siteUrl ? `: <a href="${esc(siteUrl)}">${esc(siteUrl)}</a>` : "."}
      </p>
      <p style="color:#8a8a9a;font-size:13px;margin-top:32px">— HST Training Hub</p>
    </div>`;
}

function specialtyRequestReceivedHtml(name: string, specialty: string) {
  return `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px">
      <h2 style="color:#1a1a2e;margin-bottom:16px">Request Received</h2>
      <p style="color:#4a4a5a;line-height:1.6">Hi ${esc(name)},</p>
      <p style="color:#4a4a5a;line-height:1.6">
        Your request to join <strong>${esc(specialty)}</strong> has been sent for review.
        You'll get another email once it has been decided.
      </p>
      <p style="color:#8a8a9a;font-size:13px;margin-top:32px">— HST Training Hub</p>
    </div>`;
}

function specialtyRequestDecidedHtml(
  name: string, specialty: string, approved: boolean, note: string | null,
) {
  return `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px">
      <h2 style="color:#1a1a2e;margin-bottom:16px">${approved ? "Specialty Access Approved ✅" : "Specialty Access Request Update"}</h2>
      <p style="color:#4a4a5a;line-height:1.6">Hi ${esc(name)},</p>
      <p style="color:#4a4a5a;line-height:1.6">
        ${approved
          ? `Your request to join <strong>${esc(specialty)}</strong> has been approved. It is in your sidebar the next time you sign in or refresh the page.`
          : `Your request to join <strong>${esc(specialty)}</strong> was not approved at this time.`}
      </p>
      ${note ? `<p style="color:#4a4a5a;line-height:1.6;background:#f8f8fc;padding:12px 16px;border-radius:8px;border-left:3px solid #ccc"><strong>Note:</strong> <em>${esc(note)}</em></p>` : ""}
      <p style="color:#8a8a9a;font-size:13px;margin-top:32px">— HST Training Hub</p>
    </div>`;
}

/**
 * Emails about a request to join another specialty, made from the profile page.
 *
 * Nothing is taken from the request body but the row id: who to write to, and
 * what to say, are read from the database. "submitted" may only be sent by the
 * person who made the request, while it is still pending; "decided" only by
 * somebody who may review that specialty, once it has been decided.
 */
async function handleSpecialtyRequest(
  admin: ReturnType<typeof getSupabaseAdmin>,
  req: Request,
  payload: EmailPayload,
) {
  const callerId = await getCallerId(admin, req);
  if (!callerId) return json({ error: "Not authorised" }, 403);

  const requestId = String(payload.request_id ?? "");
  const { data: request } = await admin
    .from("specialty_access_requests")
    .select("id, user_id, specialty_id, reason, status, review_note")
    .eq("id", requestId)
    .maybeSingle();
  if (!request) return json({ error: "Request not found" }, 404);

  const [{ data: person }, { data: spec }] = await Promise.all([
    admin.from("profiles").select("first_name, last_name, email").eq("user_id", request.user_id).maybeSingle(),
    admin.from("specialties").select("id, short_name, deanery_id, parent_specialty_id").eq("id", request.specialty_id).maybeSingle(),
  ]);
  const name = `${person?.first_name ?? ""} ${person?.last_name ?? ""}`.trim() || "there";
  const specialtyName = spec?.short_name ?? "a specialty";

  if (payload.type === "specialty_request_submitted") {
    if (callerId !== request.user_id || request.status !== "pending") {
      return json({ error: "Not authorised" }, 403);
    }

    // The same people can_review_specialty() lets decide it: super admins, the
    // admins of its deanery, and its facilitators (or its parent's).
    const { data: roles } = await admin
      .from("user_roles")
      .select("user_id, role, deanery_id")
      .in("role", ["admin", "super_admin"]);
    const adminIds = (roles ?? [])
      .filter((r: { role: string; deanery_id: string | null }) =>
        r.role === "super_admin" || r.deanery_id === null || r.deanery_id === spec?.deanery_id)
      .map((r: { user_id: string }) => r.user_id);
    const specIds = [spec?.id, spec?.parent_specialty_id].filter(Boolean) as string[];
    const { data: facs } = specIds.length
      ? await admin.from("facilitator_specialties").select("user_id").in("specialty_id", specIds)
      : { data: [] };
    const notifyIds = [...new Set([...adminIds, ...(facs ?? []).map((f: { user_id: string }) => f.user_id)])]
      .filter((id) => id !== request.user_id);

    if (notifyIds.length) {
      const { data: profiles } = await admin.from("profiles").select("email").in("user_id", notifyIds);
      // Fixed rather than read from the request's Origin, which the caller controls.
      const siteUrl = Deno.env.get("SITE_URL") ?? "https://traineehq.com";
      const html = specialtyRequestAlertHtml(name, person?.email ?? "", specialtyName, request.reason, siteUrl);
      for (const p of profiles ?? []) {
        if (!p.email) continue;
        try { await sendEmail(p.email, `Specialty access request: ${name} → ${specialtyName}`, html); }
        catch (e) { console.error(`Failed to notify ${p.email}:`, e); }
      }
    } else {
      console.warn(`No reviewer to notify about specialty request ${request.id}.`);
    }

    if (person?.email) {
      await sendEmail(
        person.email,
        `Request received: ${specialtyName} — HST Training Hub`,
        specialtyRequestReceivedHtml(name, specialtyName),
      );
    }
    return json({ success: true });
  }

  // specialty_request_decided
  const { data: mayReview } = await admin.rpc("can_review_specialty", {
    _user_id: callerId, _specialty_id: request.specialty_id,
  });
  if (!mayReview || request.status === "pending") {
    return json({ error: "Not authorised" }, 403);
  }
  if (!person?.email) return json({ success: true, skipped: "no email address" });
  const approved = request.status === "approved";
  await sendEmail(
    person.email,
    approved
      ? `Access approved: ${specialtyName} — HST Training Hub`
      : `Specialty access request update — HST Training Hub`,
    specialtyRequestDecidedHtml(name, specialtyName, approved, request.review_note),
  );
  return json({ success: true });
}

function submissionConfirmationHtml(name: string) {
  return `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px">
      <h2 style="color:#1a1a2e;margin-bottom:16px">Request Received</h2>
      <p style="color:#4a4a5a;line-height:1.6">Hi ${esc(name)},</p>
      <p style="color:#4a4a5a;line-height:1.6">
        Thank you for requesting access to the <strong>HST Training Hub</strong>.
        Your application has been received and will be reviewed by an administrator.
      </p>
      <p style="color:#4a4a5a;line-height:1.6">
        You'll receive another email once your request has been reviewed.
      </p>
      <p style="color:#8a8a9a;font-size:13px;margin-top:32px">— HST Training Hub</p>
    </div>`;
}

function newRequestAlertHtml(name: string, email: string, specialty: string, grade?: string) {
  return `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px">
      <h2 style="color:#1a1a2e;margin-bottom:16px">New Access Request</h2>
      <p style="color:#4a4a5a;line-height:1.6">A new access request has been submitted:</p>
      <table style="border-collapse:collapse;width:100%;margin:16px 0">
        <tr><td style="padding:8px 12px;color:#8a8a9a;font-size:13px">Name</td><td style="padding:8px 12px;color:#1a1a2e;font-weight:600">${esc(name)}</td></tr>
        <tr style="background:#f8f8fc"><td style="padding:8px 12px;color:#8a8a9a;font-size:13px">Email</td><td style="padding:8px 12px;color:#1a1a2e">${esc(email)}</td></tr>
        <tr><td style="padding:8px 12px;color:#8a8a9a;font-size:13px">Specialty</td><td style="padding:8px 12px;color:#1a1a2e">${esc(specialty)}</td></tr>
        ${grade ? `<tr style="background:#f8f8fc"><td style="padding:8px 12px;color:#8a8a9a;font-size:13px">Grade</td><td style="padding:8px 12px;color:#1a1a2e">${esc(grade)}</td></tr>` : ""}
      </table>
      <p style="color:#4a4a5a;line-height:1.6">Please log in to the Admin Panel to review this request.</p>
      <p style="color:#8a8a9a;font-size:13px;margin-top:32px">— HST Training Hub</p>
    </div>`;
}

function approvedHtml(name: string, resetLink: string) {
  return `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px">
      <h2 style="color:#1a1a2e;margin-bottom:16px">Access Approved ✅</h2>
      <p style="color:#4a4a5a;line-height:1.6">Hi ${esc(name)},</p>
      <p style="color:#4a4a5a;line-height:1.6">
        Great news! Your access request for the <strong>HST Training Hub</strong> has been approved.
      </p>
      <p style="color:#4a4a5a;line-height:1.6">
        Click the button below to set your password and activate your account:
      </p>
      <div style="text-align:center;margin:28px 0">
        <a href="${esc(resetLink)}" style="display:inline-block;background:#1a1a2e;color:#ffffff;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">
          Set Your Password
        </a>
      </div>
      <p style="color:#8a8a9a;font-size:13px">
        This link will expire in 24 hours. If it expires, you can request a new one from the login page using "Forgot password".
      </p>
      <p style="color:#8a8a9a;font-size:13px;margin-top:32px">— HST Training Hub</p>
    </div>`;
}

function rejectedHtml(name: string, reason: string) {
  return `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px">
      <h2 style="color:#1a1a2e;margin-bottom:16px">Access Request Update</h2>
      <p style="color:#4a4a5a;line-height:1.6">Hi ${esc(name)},</p>
      <p style="color:#4a4a5a;line-height:1.6">
        Unfortunately, your access request for the HST Training Hub was not approved at this time.
      </p>
      <p style="color:#4a4a5a;line-height:1.6;background:#f8f8fc;padding:12px 16px;border-radius:8px;border-left:3px solid #ccc">
        <strong>Reason:</strong> <em>${esc(reason)}</em>
      </p>
      <p style="color:#4a4a5a;line-height:1.6">
        If you believe this was in error, please contact your training programme director.
      </p>
      <p style="color:#8a8a9a;font-size:13px;margin-top:32px">— HST Training Hub</p>
    </div>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const payload: EmailPayload = await req.json();
    const { type } = payload;

    // Requests to join another specialty identify everything by the row id,
    // so they are handled before the applicant-email checks below.
    if (type === "specialty_request_submitted" || type === "specialty_request_decided") {
      return await handleSpecialtyRequest(getSupabaseAdmin(), req, payload);
    }

    const applicantEmail = String(payload.applicant_email ?? "").trim().toLowerCase();
    const applicantName = String(payload.applicant_name ?? "").trim().slice(0, MAX_NAME);

    if (!EMAIL_RE.test(applicantEmail)) {
      return json({ error: "A valid applicant email is required" }, 400);
    }

    const supabaseAdmin = getSupabaseAdmin();

    if (type === "submission_confirmation") {
      // This branch is reachable without a session, by design — the Request Access form
      // is public. It is anchored to a request row that actually exists, so it cannot be
      // used to send mail to an arbitrary address or to a name of the caller's choosing.
      const { data: request } = await supabaseAdmin
        .from("access_requests")
        .select("first_name, last_name, email, training_grade, specialty_id, status")
        .eq("email", applicantEmail)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!request) {
        return json({ error: "No pending access request found for that email" }, 404);
      }

      const name = `${request.first_name ?? ""} ${request.last_name ?? ""}`.trim();

      await sendEmail(
        request.email,
        "Access Request Received — HST Training Hub",
        submissionConfirmationHtml(name),
      );

      // Notify admins + facilitators for the chosen specialty.
      //
      // Both roles that can review a request count here. Asking only for
      // "admin" quietly excluded every super_admin, and on a site whose only
      // reviewers are super_admins that meant a request reached nobody: the
      // applicant got their confirmation and the queue sat unread.
      const { data: adminRoles } = await supabaseAdmin
        .from("user_roles")
        .select("user_id")
        .in("role", ["admin", "super_admin"]);
      const adminIds = (adminRoles ?? []).map((r: { user_id: string }) => r.user_id);

      let facilitatorIds: string[] = [];
      let specialtyName = "General";
      if (request.specialty_id) {
        const { data: spec } = await supabaseAdmin
          .from("specialties")
          .select("id, short_name")
          .eq("id", request.specialty_id)
          .maybeSingle();
        if (spec) {
          specialtyName = spec.short_name ?? "General";
          const { data: facRoles } = await supabaseAdmin
            .from("facilitator_specialties")
            .select("user_id")
            .eq("specialty_id", spec.id);
          facilitatorIds = (facRoles ?? []).map((r: { user_id: string }) => r.user_id);
        }
      }

      const notifyIds = [...new Set([...adminIds, ...facilitatorIds])];
      if (notifyIds.length > 0) {
        const { data: profiles } = await supabaseAdmin
          .from("profiles")
          .select("email")
          .in("user_id", notifyIds);
        const emails = (profiles ?? [])
          .map((p: { email: string | null }) => p.email)
          .filter((e: string | null): e is string => !!e);
        const alertHtml = newRequestAlertHtml(
          name, request.email, specialtyName, request.training_grade ?? undefined,
        );
        if (emails.length === 0) {
          console.warn(
            `No reviewer could be emailed about ${request.email}: ` +
            `${notifyIds.length} admin/facilitator account(s), none with an email address.`,
          );
        }
        for (const email of emails) {
          try { await sendEmail(email, `New Access Request: ${name}`, alertHtml); }
          catch (e) { console.error(`Failed to notify ${email}:`, e); }
        }
      } else {
        // Nothing to send means nobody is watching the queue — say so, rather
        // than returning success on a request no human will ever see.
        console.warn(
          `No admin or facilitator to notify about the access request from ${request.email}.`,
        );
      }

      return json({ success: true });
    }

    // Everything below provisions accounts or tells an applicant the outcome of a
    // review, so it requires a signed-in reviewer.
    const reviewer = await getReviewer(supabaseAdmin, req);
    if (!reviewer) {
      return json({ error: "Not authorised" }, 403);
    }

    if (type === "approved") {
      const nameParts = applicantName.split(" ");
      const firstName = nameParts[0] || "";
      const lastName = nameParts.slice(1).join(" ") || "";

      let userId: string | undefined;

      // 1. Check if user already exists
      const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
      const existingUser = existingUsers?.users?.find(
        (u: { email?: string; id: string }) => u.email?.toLowerCase() === applicantEmail
      );

      if (existingUser) {
        console.log(`User ${applicantEmail} already exists, skipping creation.`);
        userId = existingUser.id;
      } else {
        // Create new user account
        const tempPassword = crypto.randomUUID() + "!Aa1";
        const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
          email: applicantEmail,
          password: tempPassword,
          email_confirm: true,
          user_metadata: { first_name: firstName, last_name: lastName },
        });

        if (createError) {
          console.error("Failed to create user:", createError);
          throw new Error(`Failed to create user account: ${createError.message}`);
        }
        userId = newUser?.user?.id;
      }

      // 2. Assign trainee to requested specialty if one was specified
      if (userId && payload.specialty_id) {
        const { error: assignError } = await supabaseAdmin.from("trainee_specialties").insert({
          user_id: userId,
          specialty_id: payload.specialty_id,
        });
        if (assignError && !assignError.message?.includes("duplicate")) {
          console.error("Failed to assign specialty:", assignError);
        }
      }

      // 2b. Update profile with deanery_id if provided
      if (userId && payload.deanery_id) {
        const { error: deaneryError } = await supabaseAdmin
          .from("profiles")
          .update({ deanery_id: payload.deanery_id })
          .eq("user_id", userId);
        if (deaneryError) {
          console.error("Failed to set deanery on profile:", deaneryError);
        }
      }

      // 3. Generate a password reset link so user can set their own password
      const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
        type: "recovery",
        email: applicantEmail,
      });

      const resetLink = (!linkError && linkData?.properties?.action_link)
        ? linkData.properties.action_link
        : "#";

      await sendEmail(
        applicantEmail,
        "Access Approved — HST Training Hub",
        approvedHtml(applicantName, resetLink),
      );

      return json({ success: true, user_id: userId });
    }

    if (type === "rejected") {
      const reason = String(payload.review_note ?? "").trim().slice(0, MAX_NOTE) || "No reason provided.";
      await sendEmail(applicantEmail, "Access Request Update — HST Training Hub", rejectedHtml(applicantName, reason));
      return json({ success: true });
    }

    return json({ error: "Unknown email type" }, 400);
  } catch (error) {
    console.error("Email function error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return json({ error: message }, 500);
  }
});
