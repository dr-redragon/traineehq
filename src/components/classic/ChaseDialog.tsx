import { useState } from "react";
import { toast } from "sonner";
import { Modal } from "@/components/classic/Modal";
import { chaseAbsences } from "@/lib/classic/liveApi";
import { defaultChaseBody, defaultChaseSubject, splitByEmail } from "@/lib/classic/chase";
import { formatMonth } from "@/lib/classic/months";
import type { RegisterSession, RegisterTrainee } from "@/lib/classic/types";

/**
 * The absence chaser: one editable email to everybody unaccounted for.
 *
 * The draft is a draft. It is shown in full, in an editable box, with a preview
 * underneath, because this message goes out over the organiser's name to
 * trainees they work with — and a form letter that cannot be softened is one
 * nobody sends.
 *
 * Only the register's own roster can be written to: the edge function drops any
 * address that is not on it, so this cannot be turned into a way of sending mail
 * from the training hub to arbitrary people.
 */
export function ChaseDialog({
  session,
  registerName,
  absentees,
  onClose,
}: {
  session: RegisterSession;
  registerName: string;
  absentees: RegisterTrainee[];
  onClose: () => void;
}) {
  const { withEmail, withoutEmail } = splitByEmail(absentees);
  const [subject, setSubject] = useState(() => defaultChaseSubject(session));
  const [body, setBody] = useState(() => defaultChaseBody(session, registerName));
  const [sending, setSending] = useState(false);

  const send = async () => {
    if (!session.cloudId || withEmail.length === 0) return;
    setSending(true);
    try {
      const outcome = await chaseAbsences({
        sessionId: session.cloudId,
        recipients: withEmail.map((t) => t.email!).filter(Boolean),
        subject,
        body,
      });
      toast.success(
        `Sent to ${outcome.sent} of ${outcome.considered}.` +
        (outcome.not_on_roster ? ` ${outcome.not_on_roster} not on the roster.` : "") +
        (outcome.failures.length ? ` ${outcome.failures.length} failed.` : ""));
      onClose();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal
      title="Ask about an absence"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button
            type="button"
            className="btn primary"
            disabled={sending || withEmail.length === 0}
            onClick={send}
          >
            {sending ? "Sending…" : `Send to ${withEmail.length}`}
          </button>
        </>
      }
    >
      <label className="fld">To</label>
      <div className="chase-to">
        {withEmail.map((t) => <span className="who" key={t.id}>{t.name}</span>)}
      </div>

      {withoutEmail.length > 0 && (
        <div className="notice warn" style={{ marginTop: 12 }}>
          {withoutEmail.length} trainee{withoutEmail.length === 1 ? " has" : "s have"} no
          email address on the register and cannot be written to:{" "}
          {withoutEmail.map((t) => t.name).join(", ")}. Add an address on their
          row under “Trainees &amp; sessions”.
        </div>
      )}

      <div className="field" style={{ marginTop: 16 }}>
        <label className="fld">Subject</label>
        <input value={subject} onChange={(e) => setSubject(e.target.value)} />
      </div>

      <div className="field">
        <label className="fld">Message — edit freely before sending</label>
        <textarea
          style={{ minHeight: 190, width: "100%" }}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
      </div>

      <label className="fld">Preview</label>
      <div className="chase-preview">
        <div className="hdr">
          <strong>{subject}</strong><br />
          {session.title} · {formatMonth(session.month)}
        </div>
        {body.split(/\n{2,}/).map((paragraph, i) => <p key={i}>{paragraph}</p>)}
      </div>
    </Modal>
  );
}
