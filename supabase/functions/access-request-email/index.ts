import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const RESEND_API = "https://api.resend.com/emails";
const FROM_EMAIL = "HST Training Hub <onboarding@resend.dev>";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MAX_NAME = 200;
const MAX_NOTE = 2000;

interface EmailPayload {
  type: "submission_confirmation" | "new_request_alert" | "approved" | "rejected";
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
    body: JSON.stringify({ from: FROM_EMAIL, to: [to], subject, html }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend API error [${res.status}]: ${body}`);
  }
  return res.json();
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

      // Notify admins + facilitators for the chosen specialty
      const { data: adminRoles } = await supabaseAdmin
        .from("user_roles")
        .select("user_id")
        .eq("role", "admin");
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
        for (const email of emails) {
          try { await sendEmail(email, `New Access Request: ${name}`, alertHtml); }
          catch (e) { console.error(`Failed to notify ${email}:`, e); }
        }
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
