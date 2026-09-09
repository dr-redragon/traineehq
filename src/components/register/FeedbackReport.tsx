import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { FeedbackSummary } from "@/lib/register/feedbackReport";

/**
 * The cohort's feedback for one teaching day, drawn.
 *
 * Bars rather than numbers alone: "4.1" means nothing until you can see it
 * against the width of the scale, and a mean of 4.0 made of twenty fours is a
 * different teaching day from one made of tens of fives and threes. The shape is
 * what says which.
 */
export function FeedbackReport({ summary }: { summary: FeedbackSummary }) {
  if (!summary.responses) {
    return <p className="text-sm text-muted-foreground">No feedback yet for this teaching day.</p>;
  }

  const maxBar = Math.max(...summary.distribution, 1);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Figure n={String(summary.responses)} label="Responses" />
        <Figure n={String(summary.attendees)} label="Signed in" />
        <Figure
          n={summary.responseRate === null ? "—" : `${summary.responseRate}%`}
          label="Response rate"
        />
        <Figure
          n={summary.overall === null ? "—" : summary.overall.toFixed(1)}
          label="Mean overall (of 5)"
        />
      </div>

      <section className="space-y-2">
        <Heading>Overall rating</Heading>
        <div className="space-y-1">
          {[5, 4, 3, 2, 1].map((score) => (
            <Row
              key={score}
              label={`${score} ★`}
              width={(summary.distribution[score - 1] / maxBar) * 100}
              value={String(summary.distribution[score - 1])}
            />
          ))}
        </div>
      </section>

      {summary.questions.length > 0 && (
        <section className="space-y-3">
          <Heading>By question</Heading>
          {summary.questions.map((q) => {
            if (q.kind === "scale") {
              return (
                <Row
                  key={q.id}
                  label={q.label}
                  note={`${q.count} ${q.count === 1 ? "reply" : "replies"}`}
                  width={((q.average ?? 0) / 5) * 100}
                  value={q.average === null ? "—" : q.average.toFixed(1)}
                  strong
                />
              );
            }

            if (q.kind === "tally") {
              const top = Math.max(1, ...q.options.map((o) => o.count));
              return (
                <div key={q.id} className="space-y-1">
                  <p className="text-sm font-semibold">{q.label}</p>
                  {q.options.map((o) => (
                    <Row
                      key={o.option}
                      label={o.option}
                      width={(o.count / top) * 100}
                      value={String(o.count)}
                      indent
                    />
                  ))}
                </div>
              );
            }

            return (
              <div key={q.id} className="space-y-1.5">
                <p className="text-sm font-semibold">
                  {q.label}{" "}
                  <span className="text-xs font-normal text-muted-foreground">
                    ({q.answers.length})
                  </span>
                </p>
                {q.answers.map((answer, i) => (
                  <Card key={i}>
                    <CardContent className="p-2.5">
                      <p className="whitespace-pre-wrap text-sm">{answer}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            );
          })}
        </section>
      )}

      {summary.comments.length > 0 && (
        <section className="space-y-2">
          <Heading>Comments ({summary.comments.length})</Heading>
          {summary.comments.map((r) => (
            <Card key={r.id}>
              <CardContent className="space-y-1 p-3">
                <p className="whitespace-pre-wrap text-sm">{r.comments}</p>
                <p className="text-[11px] text-muted-foreground">
                  {new Date(r.submitted_at).toLocaleDateString("en-GB", {
                    day: "numeric", month: "long", year: "numeric",
                  })}
                  {r.overall_rating ? ` · rated ${r.overall_rating}/5` : ""}
                </p>
              </CardContent>
            </Card>
          ))}
        </section>
      )}

      {summary.themes.length > 0 && (
        <section className="space-y-2">
          <Heading>Recurring words</Heading>
          <div className="flex flex-wrap gap-1.5">
            {summary.themes.map((t) => (
              <Badge key={t.word} variant="secondary" className="text-[11px]">
                {t.word} <span className="ml-1 opacity-60">{t.count}</span>
              </Badge>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground">
            A word count across the comments, nothing cleverer — the comments themselves are
            above.
          </p>
        </section>
      )}
    </div>
  );
}

function Heading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </h3>
  );
}

function Figure({ n, label }: { n: string; label: string }) {
  return (
    <div className="rounded-lg border bg-card px-3 py-2.5">
      <p className="font-display text-xl font-bold tabular-nums">{n}</p>
      <p className="text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}

function Row({
  label, note, width, value, indent, strong,
}: {
  label: string;
  note?: string;
  width: number;
  value: string;
  indent?: boolean;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className={`min-w-0 flex-1 truncate text-sm ${indent ? "pl-3" : ""}`}>{label}</span>
      {note && <span className="hidden text-[11px] text-muted-foreground sm:inline">{note}</span>}
      <span className="h-2.5 w-20 shrink-0 overflow-hidden rounded-full bg-muted sm:w-32">
        <span className="block h-full rounded-full bg-primary" style={{ width: `${width}%` }} />
      </span>
      <span className={`w-10 shrink-0 text-right text-sm tabular-nums ${
        strong ? "font-semibold" : "text-muted-foreground"}`}>
        {value}
      </span>
    </div>
  );
}
