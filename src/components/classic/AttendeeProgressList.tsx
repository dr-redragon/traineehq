import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { emailFeedbackLink } from "@/lib/classic/liveApi";
import {
  bytesToBase64, certificateFilename, renderCertificatePdf,
} from "@/lib/classic/certificate";
import { registerLogoUrl } from "@/lib/classic/logo";
import type {
  RegisterAttendee, RegisterDirectoryEntry, SessionStatus,
} from "@/lib/classic/types";

/**
 * Who has signed in, whether they have given feedback, and whether their
 * certificate has gone out — the same table the standalone register's session
 * console showed, ported onto the classic register's own attendee shape.
 *
 * Feedback and certificates are tracked separately from the sign-in tick
 * because they are two different asks of the same person: the original
 * required feedback before a certificate would go, but never stopped an
 * organiser sending (or re-sending) one anyway — somebody who lost the email,
 * or asks for it again, should not have to be talked out of it.
 */
export function AttendeeProgressList({
  entry,
  sessionId,
  status,
}: {
  entry: RegisterDirectoryEntry;
  sessionId: string;
  status: SessionStatus;
}) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<string[]>([]);
  const [sendingFeedback, setSendingFeedback] = useState<"all" | "selected" | null>(null);
  const [sendingCert, setSendingCert] = useState<string | "selected" | null>(null);

  const attendees = status.attendees;
  const outstanding = attendees.filter((a) => !a.feedback_completed);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["classic-session-status"] });

  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const sendFeedback = async (ids: string[] | null) => {
    if (ids && !ids.length) {
      toast.info("Tick at least one person, or send to everyone outstanding.");
      return;
    }
    setSendingFeedback(ids ? "selected" : "all");
    try {
      const outcome = await emailFeedbackLink({ sessionId, attendeeIds: ids ?? undefined });
      toast.success(
        `Feedback link sent to ${outcome.sent} of ${outcome.considered}.` +
        (outcome.failures.length ? ` ${outcome.failures.length} could not be sent.` : ""));
      await refresh();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSendingFeedback(null);
    }
  };

  const detailsFor = (attendee: RegisterAttendee) => ({
    traineeName: attendee.name,
    registerName: entry.name,
    deaneryName: entry.deanery_name,
    sessionTitle: status.session.title,
    sessionDate: status.session.session_date,
    location: status.session.location,
    logoUrl: registerLogoUrl(entry.certificate_logo_path),
  });

  /** Render the certificate and hand it to the trainee — a genuine send, not a preview. */
  const emailCertificateTo = async (attendee: RegisterAttendee) => {
    const bytes = await renderCertificatePdf(detailsFor(attendee));
    const { data, error } = await supabase.functions.invoke("register-certificate", {
      body: {
        session_id: sessionId, attendee_id: attendee.id, pdf_base64: bytesToBase64(bytes),
      },
    });
    if (error) {
      const carried = (error as { context?: { json?: () => Promise<{ error?: string }> } }).context;
      const detail = await carried?.json?.().catch(() => null);
      throw new Error(detail?.error ?? "Could not send it");
    }
    const refusal = data as { error?: string } | null;
    if (refusal?.error) throw new Error(refusal.error);
  };

  /**
   * One person, from their own row — this is the button that covers "resend",
   * since it works exactly the same way whether or not `certificate_sent_at`
   * is already set.
   */
  const sendOne = async (attendee: RegisterAttendee) => {
    if (!attendee.feedback_completed && !window.confirm(
      `${attendee.name} has not given feedback yet. Send their certificate anyway?`)) return;
    setSendingCert(attendee.id);
    try {
      await emailCertificateTo(attendee);
      toast.success(
        attendee.certificate_sent_at
          ? `Certificate re-sent to ${attendee.name}.`
          : `Certificate sent to ${attendee.name}.`);
      await refresh();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSendingCert(null);
    }
  };

  /** Whoever is ticked, regardless of whether they already have one — the bulk resend. */
  const sendSelected = async () => {
    const chosen = attendees.filter((a) => selected.includes(a.id));
    if (!chosen.length) {
      toast.info("Tick at least one person to send or resend their certificate.");
      return;
    }
    const missingFeedback = chosen.filter((a) => !a.feedback_completed);
    if (missingFeedback.length && !window.confirm(
      `${missingFeedback.length} of the people ticked ${missingFeedback.length === 1 ? "has" : "have"} not given ` +
      "feedback yet. Send their certificates anyway?")) return;

    setSendingCert("selected");
    let sent = 0;
    const failures: string[] = [];
    for (const attendee of chosen) {
      try {
        await emailCertificateTo(attendee);
        sent++;
      } catch (error) {
        failures.push(`${attendee.name}: ${(error as Error).message}`);
      }
    }
    setSendingCert(null);
    await refresh();
    if (sent) toast.success(`${sent} certificate${sent === 1 ? "" : "s"} sent.`);
    if (failures.length) toast.error(failures[0], {
      description: failures.length > 1 ? `and ${failures.length - 1} more` : undefined,
    });
  };

  const downloadOne = async (attendee: RegisterAttendee) => {
    try {
      const details = detailsFor(attendee);
      const bytes = await renderCertificatePdf(details);
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = certificateFilename(details);
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  if (!attendees.length) {
    return <p className="helper">Nobody has signed in yet.</p>;
  }

  return (
    <>
      <div className="row-actions">
        <button
          type="button"
          className="btn ghost sm"
          disabled={sendingFeedback !== null || !outstanding.length}
          onClick={() => sendFeedback(null)}
        >
          {sendingFeedback === "all" ? "Sending…" : `Email everyone outstanding (${outstanding.length})`}
        </button>
        <button
          type="button"
          className="btn ghost sm"
          disabled={sendingFeedback !== null}
          onClick={() => sendFeedback(selected)}
        >
          {sendingFeedback === "selected" ? "Sending…" : `Email feedback to selected (${selected.length})`}
        </button>
        <button
          type="button"
          className="btn ghost sm"
          disabled={sendingCert !== null || !selected.length}
          onClick={sendSelected}
        >
          {sendingCert === "selected" ? "Sending…" : `Email certificates to selected (${selected.length})`}
        </button>
      </div>
      <p className="helper">
        Feedback links go to whoever has not yet answered. Certificates can be sent — or
        re-sent — to anyone ticked, whether or not they already have one.
      </p>

      <div className="att-list" style={{ marginTop: 10 }}>
        {attendees.map((a) => (
          <div className="att-row" key={a.id} style={{ gridTemplateColumns: "22px 1.4fr auto" }}>
            <input
              type="checkbox"
              checked={selected.includes(a.id)}
              aria-label={`Select ${a.name}`}
              onChange={() => toggle(a.id)}
            />
            <span className="who">
              {a.name}
              {a.grade && <small> · {a.grade}</small>}
            </span>
            <span className="att-tags">
              <span className={"att-tag " + (a.feedback_completed ? "yes" : "no")}>
                {a.feedback_completed ? "Feedback given" : "No feedback"}
              </span>
              <span className={"att-tag " + (a.certificate_sent_at ? "yes" : a.feedback_completed ? "wait" : "no")}>
                {a.certificate_sent_at ? "Certificate sent" : a.feedback_completed ? "Certificate due" : "Gated"}
              </span>
              <button
                type="button"
                className="btn ghost sm"
                disabled={!a.feedback_completed}
                title={a.feedback_completed ? `Download the certificate for ${a.name}` : `${a.name} has not given feedback yet`}
                onClick={() => downloadOne(a)}
              >
                Download
              </button>
              <button
                type="button"
                className="btn ghost sm"
                disabled={sendingCert !== null}
                onClick={() => sendOne(a)}
              >
                {sendingCert === a.id ? "Sending…" : a.certificate_sent_at ? "Resend" : "Send now"}
              </button>
            </span>
          </div>
        ))}
      </div>
    </>
  );
}
