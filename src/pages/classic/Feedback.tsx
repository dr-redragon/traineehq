import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ClassicPageShell } from "@/components/classic/ClassicPageShell";
import { FeedbackField } from "@/components/classic/FeedbackField";
import { fetchPublicSession, submitFeedback } from "@/lib/classic/liveApi";
import { recallCheckIn } from "@/lib/classic/checkInMemory";

type Answers = Record<string, string | number | string[] | undefined>;

/**
 * The feedback form, re-created from the standalone register's feedback.html.
 *
 * Anonymous in the way that matters: the identifier travels with the request so
 * the register can tick off who has responded and send their certificate, but it
 * is never stored alongside the answers. Organisers can see WHAT was said and
 * THAT a given person has replied, never which of the two goes with the other —
 * which is the only reason anybody answers honestly.
 */
export default function ClassicFeedback() {
  const sessionId = new URLSearchParams(window.location.search).get("s") ?? "";
  const remembered = useMemo(() => recallCheckIn(sessionId), [sessionId]);

  const [identifier, setIdentifier] = useState(remembered?.attendeeId ?? "");
  const [answers, setAnswers] = useState<Answers>({});
  const [comments, setComments] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<"recorded" | "already_submitted" | null>(null);
  const [problem, setProblem] = useState("");

  const session = useQuery({
    queryKey: ["classic-public-session", sessionId],
    queryFn: () => fetchPublicSession(sessionId),
    enabled: !!sessionId,
    retry: false,
  });

  const form = session.data?.form ?? null;
  const overall = form?.questions.find((q) => q.locked) ?? form?.questions[0];

  const set = (id: string, value: Answers[string]) =>
    setAnswers((a) => ({ ...a, [id]: value }));

  const submit = async () => {
    if (!identifier.trim()) {
      setProblem("Enter the name or email you signed in with, so your certificate can be sent.");
      return;
    }
    const rating = Number(overall ? answers[overall.id] : NaN);
    if (!Number.isFinite(rating) || rating <= 0) {
      setProblem("Please give the session an overall rating.");
      return;
    }
    const missing = (form?.questions ?? []).find(
      (q) => q.required && q.id !== overall?.id && !answers[q.id]?.toString().trim());
    if (missing) { setProblem(`“${missing.text}” needs an answer.`); return; }

    setSubmitting(true);
    try {
      const result = await submitFeedback({
        sessionId, identifier: identifier.trim(), overallRating: rating, answers, comments,
      });
      setDone(result.status);
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "Something went wrong — please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!sessionId || session.isError || (!session.isLoading && !session.data)) {
    return (
      <ClassicPageShell>
        <div className="card">
          <h1>This feedback link is not valid any more</h1>
          <p className="lede">Ask the organiser for a fresh link.</p>
        </div>
      </ClassicPageShell>
    );
  }

  if (session.isLoading) {
    return (
      <ClassicPageShell>
        <div className="card"><div className="lede">Loading the form…</div></div>
      </ClassicPageShell>
    );
  }

  if (done) {
    return (
      <ClassicPageShell>
        <div className="card">
          <div className="done">
            <div className="tick">✓</div>
            <h2>{done === "already_submitted" ? "Already received" : "Thank you"}</h2>
            <p>
              {done === "already_submitted"
                ? "We already have your feedback for this session."
                : "Your feedback has been recorded, and your certificate is on its way."}
            </p>
          </div>
        </div>
      </ClassicPageShell>
    );
  }

  return (
    <ClassicPageShell>
      <div className="card">
        <h1>{form?.title ?? "Session feedback"}</h1>
        <p className="lede session-line">
          {session.data!.title}
          <br />
          <span className="session-sub">
            {new Date(session.data!.session_date).toLocaleDateString("en-GB", {
              day: "numeric", month: "long", year: "numeric",
            })}
          </span>
        </p>

        {problem && <div className="notice bad">{problem}</div>}

        <div className="field">
          <label className="fld" htmlFor="identifier">The name or email you signed in with</label>
          <input
            id="identifier"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            placeholder="you@example.nhs.uk"
          />
          <p className="helper">
            {remembered
              ? "Filled in from your sign-in on this device. It identifies you for the certificate only — it is not stored with your answers."
              : "Used to send your certificate and to tick you off the list. It is not stored with your answers."}
          </p>
        </div>

        {(form?.questions ?? []).map((question) => (
          <FeedbackField
            key={question.id}
            question={question}
            value={answers[question.id]}
            onChange={(value) => set(question.id, value)}
          />
        ))}

        <div className="field">
          <label className="fld" htmlFor="comments">Anything else?</label>
          <textarea
            id="comments"
            value={comments}
            onChange={(e) => setComments(e.target.value)}
            placeholder="Optional"
          />
        </div>

        <button type="button" className="btn primary block" disabled={submitting} onClick={submit}>
          {submitting && <span className="spinner" />}
          {submitting ? "Sending…" : "Send feedback"}
        </button>
      </div>
    </ClassicPageShell>
  );
}
