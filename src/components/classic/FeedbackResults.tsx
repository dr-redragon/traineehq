import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchFeedback } from "@/lib/classic/liveApi";
import { feedbackCsv } from "@/lib/classic/feedbackCsv";
import type { FeedbackForm } from "@/lib/classic/types";

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/**
 * What the cohort said about one teaching day.
 *
 * The answers were always being collected — the feedback form gates the
 * certificate — but the classic register had nowhere to read them. This is
 * that place: how the day was rated overall, the average for each rated
 * question, and the comments, with the whole set downloadable.
 *
 * Anonymous by construction: a response row carries no attendee, so nothing
 * here can be traced to a person, and the page says so.
 *
 * The questions come from the day's own stored form, not the current template,
 * so rewording a question later does not relabel answers given to the old one.
 */
export function FeedbackResults({
  sessionId, form, title,
}: {
  sessionId: string;
  form: FeedbackForm | null;
  title: string;
}) {
  const { data: responses, isLoading, error } = useQuery({
    queryKey: ["classic-feedback", sessionId],
    queryFn: () => fetchFeedback(sessionId),
  });

  const distribution = useMemo(() => {
    const counts = [0, 0, 0, 0, 0];
    for (const r of responses ?? []) {
      if (r.overall_rating && r.overall_rating >= 1 && r.overall_rating <= 5) counts[r.overall_rating - 1]++;
    }
    return counts;
  }, [responses]);

  const scored = useMemo(() => (form?.questions ?? [])
    .filter((q) => q.type === "scale")
    .map((q) => {
      const values = (responses ?? [])
        .map((r) => (q.id === "overall" ? r.overall_rating : Number(r.answers?.[q.id])))
        .filter((n): n is number => Number.isFinite(n as number));
      return { question: q, average: mean(values), count: values.length };
    }), [form, responses]);

  const comments = (responses ?? []).filter((r) => r.comments?.trim());

  const download = () => {
    if (!responses?.length) return;
    const url = URL.createObjectURL(
      new Blob([feedbackCsv(responses, form)], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `feedback-${title.replace(/[^\w-]+/g, "-").toLowerCase()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) return <p className="helper">Reading the feedback…</p>;
  if (error) return <div className="notice bad">{(error as Error).message}</div>;
  if (!responses?.length) {
    return <p className="helper">Nobody has answered the feedback form for this day yet.</p>;
  }

  return (
    <div className="feedback-results">
      <div className="row-actions" style={{ justifyContent: "space-between" }}>
        <span>
          <strong>{responses.length}</strong> {responses.length === 1 ? "response" : "responses"}
          <span className="li-sub"> · answers carry no name and cannot be traced to one</span>
        </span>
        <button type="button" className="btn ghost sm" onClick={download}>
          Download responses (CSV)
        </button>
      </div>

      {distribution.some((n) => n > 0) && (
        <>
          <div className="grouphead">Overall rating</div>
          {[5, 4, 3, 2, 1].map((score) => {
            const count = distribution[score - 1];
            return (
              <div className="fb-bar-row" key={score}>
                <span className="fb-score">{score}</span>
                <div className="pct-bar fb-bar">
                  <span style={{ width: `${(count / responses.length) * 100}%`, background: "var(--moss)" }} />
                </div>
                <span className="fb-count">{count}</span>
              </div>
            );
          })}
        </>
      )}

      {scored.length > 0 && (
        <>
          <div className="grouphead">Ratings</div>
          {scored.map(({ question, average, count }) => (
            <div className="list-item" key={question.id}>
              <div>{question.text}</div>
              <div className="row-actions">
                <div className="pct-bar" style={{ width: 90 }}>
                  <span style={{ width: `${((average ?? 0) / 5) * 100}%`, background: "var(--moss)" }} />
                </div>
                <strong style={{ minWidth: 44, textAlign: "right" }}>
                  {average === null ? "—" : `${average.toFixed(1)}/5`}
                </strong>
                <span className="li-sub">n={count}</span>
              </div>
            </div>
          ))}
        </>
      )}

      {comments.length > 0 && (
        <>
          <div className="grouphead">Comments ({comments.length})</div>
          {comments.map((r) => (
            <blockquote className="fb-comment" key={r.id}>{r.comments}</blockquote>
          ))}
        </>
      )}
    </div>
  );
}
