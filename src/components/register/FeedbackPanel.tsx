import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MessageSquare } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchFeedback, fetchLiveSessions } from "@/lib/register/liveApi";
import type { FeedbackQuestion } from "@/lib/register/types";

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/**
 * What the cohort said about a teaching day.
 *
 * Anonymous by construction, not by convention: these rows carry no identifier
 * and no foreign key to an attendee, so there is nothing to join a comment back
 * to a person even with database access. That is worth stating on the page —
 * people answer honestly only if they believe it.
 *
 * The questions are read off the session's own stored form rather than a current
 * template, so rewording a question later does not relabel answers given to the
 * old one.
 */
export function FeedbackPanel({ registerId }: { registerId: string }) {
  const [sessionId, setSessionId] = useState("");

  const { data: sessions, isLoading } = useQuery({
    queryKey: ["register-live-sessions", registerId],
    queryFn: () => fetchLiveSessions(registerId),
    enabled: !!registerId,
  });

  const selected = sessions?.find((s) => s.id === sessionId);

  const { data: responses, isLoading: loadingResponses } = useQuery({
    queryKey: ["register-feedback", sessionId],
    queryFn: () => fetchFeedback(sessionId),
    enabled: !!sessionId,
  });

  // Read inside the memo rather than beside it: a fresh [] every render would
  // make the dependency change on every render and the memo pointless.
  const scored = useMemo(() => {
    const questions: FeedbackQuestion[] = selected?.form?.questions ?? [];
    if (!responses?.length) return [];
    return questions
      .filter((q) => q.type === "scale")
      .map((q) => {
        const values = responses
          .map((r) => q.id === "overall" ? r.overall_rating : Number(r.answers?.[q.id]))
          .filter((n): n is number => Number.isFinite(n as number));
        return { question: q, average: mean(values), count: values.length };
      });
  }, [responses, selected?.form?.questions]);

  const comments = useMemo(
    () => (responses ?? []).filter((r) => r.comments?.trim()),
    [responses],
  );

  if (isLoading) return <Skeleton className="h-40 w-full" />;

  if (!sessions?.length) {
    return (
      <p className="text-sm text-muted-foreground">
        No teaching day has been published for check-in yet, so there is no feedback to read.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <div className="max-w-sm space-y-1.5">
        <Select value={sessionId} onValueChange={setSessionId}>
          <SelectTrigger><SelectValue placeholder="Choose a teaching day" /></SelectTrigger>
          <SelectContent>
            {sessions.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {new Date(s.session_date).toLocaleDateString("en-GB", {
                  day: "numeric", month: "short", year: "numeric",
                })} · {s.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!sessionId ? null : loadingResponses ? (
        <Skeleton className="h-40 w-full" />
      ) : !responses?.length ? (
        <p className="text-sm text-muted-foreground">Nobody has answered for that day yet.</p>
      ) : (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant="secondary">
              {responses.length} {responses.length === 1 ? "response" : "responses"}
            </Badge>
            <p className="text-xs text-muted-foreground">
              Answers carry no name, and cannot be traced to one.
            </p>
          </div>

          {scored.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-sm font-semibold">Ratings</h3>
              <div className="divide-y rounded-lg border">
                {scored.map(({ question, average, count }) => (
                  <div key={question.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                    <p className="min-w-0 flex-1 text-sm">{question.text}</p>
                    <div className="flex items-center gap-2">
                      {/* A bar rather than a number alone: five means nothing
                          until you can see it against the width of the scale. */}
                      <div className="h-2 w-24 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${((average ?? 0) / 5) * 100}%` }}
                        />
                      </div>
                      <span className="w-14 text-right text-sm font-semibold tabular-nums">
                        {average === null ? "—" : `${average.toFixed(1)}/5`}
                      </span>
                      <span className="w-10 text-right text-[11px] text-muted-foreground">
                        n={count}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {comments.length > 0 && (
            <section className="space-y-2">
              <h3 className="flex items-center gap-1.5 text-sm font-semibold">
                <MessageSquare className="h-4 w-4" /> Comments
                <Badge variant="outline" className="ml-1 text-[10px]">{comments.length}</Badge>
              </h3>
              <div className="space-y-2">
                {comments.map((r) => (
                  <Card key={r.id}>
                    <CardContent className="p-3">
                      <p className="whitespace-pre-wrap text-sm">{r.comments}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
