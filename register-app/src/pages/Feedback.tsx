import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { RegisterPageShell } from "@/components/register/RegisterPageShell";
import { FeedbackQuestionField } from "@/components/register/FeedbackQuestionField";
import { fetchPublicSession, submitFeedback } from "@/lib/register/liveApi";
import { recallCheckIn } from "@/lib/register/checkInMemory";

type Answers = Record<string, string | number | string[]>;

/**
 * The anonymous feedback form.
 *
 * Nothing identifying is stored with the answers: the identifier travels only as
 * far as the function that flips this person's "has given feedback" flag, and
 * never reaches the row. An organiser reading these learns what was said and not
 * by whom, which is the only reason anybody answers honestly.
 */
export default function Feedback() {
  const sessionId = new URLSearchParams(window.location.search).get("s") ?? "";
  const remembered = useMemo(() => recallCheckIn(sessionId), [sessionId]);

  const [identifier, setIdentifier] = useState(remembered?.attendeeId ?? "");
  const [answers, setAnswers] = useState<Answers>({});
  const [comments, setComments] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<"recorded" | "already_submitted" | null>(null);
  const [problem, setProblem] = useState("");

  const session = useQuery({
    queryKey: ["public-session", sessionId],
    queryFn: () => fetchPublicSession(sessionId),
    enabled: !!sessionId,
    retry: false,
  });

  const form = session.data?.form;
  const questions = form?.questions ?? [];
  const overall = questions.find((q) => q.id === "overall") ?? questions.find((q) => q.type === "scale");

  const set = (id: string, value: string | number | string[]) =>
    setAnswers((a) => ({ ...a, [id]: value }));

  if (!sessionId) {
    return <Shell><Message title="This feedback link is incomplete">
      Ask the organiser for a fresh link.
    </Message></Shell>;
  }

  if (session.isLoading) return <Shell><Skeleton className="h-64 w-full" /></Shell>;

  if (session.isError || !session.data) {
    return <Shell><Message title="This feedback link is not valid any more">
      The teaching day may have been unpublished.
    </Message></Shell>;
  }

  if (done) {
    return (
      <Shell>
        <Card>
          <CardContent className="space-y-3 py-10 text-center">
            <CheckCircle2 className="mx-auto h-12 w-12 text-success" />
            <h1 className="font-display text-xl font-bold">
              {done === "already_submitted" ? "You've already answered" : "Thank you"}
            </h1>
            <p className="mx-auto max-w-sm text-sm text-muted-foreground">
              {done === "already_submitted"
                ? "We have your feedback for this teaching day already."
                : "Your answers are anonymous — they are stored with no name attached."}
            </p>
          </CardContent>
        </Card>
      </Shell>
    );
  }

  const submit = async () => {
    const rating = Number(overall ? answers[overall.id] : NaN);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      setProblem("Please give an overall rating.");
      return;
    }
    const missing = questions.find(
      (q) => q.required && q.id !== overall?.id && !answers[q.id]?.toString().trim(),
    );
    if (missing) { setProblem(`Please answer: ${missing.text}`); return; }
    if (!identifier.trim()) {
      setProblem("Enter the email you signed in with, so we know to stop asking you.");
      return;
    }

    setSubmitting(true);
    try {
      const result = await submitFeedback({
        sessionId, identifier: identifier.trim(), overallRating: rating, answers, comments,
      });
      setDone(result.status);
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "Something went wrong — please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Shell>
      <div className="space-y-1">
        <h1 className="font-display text-xl font-bold tracking-tight">
          {form?.title ?? "Session feedback"}
        </h1>
        <p className="text-sm text-muted-foreground">{session.data.title}</p>
      </div>

      <Card>
        <CardContent className="space-y-6 p-4">
          {questions.map((q) => (
            <FeedbackQuestionField
              key={q.id} q={q} value={answers[q.id]} onChange={(v) => set(q.id, v)} />
          ))}

          <div className="space-y-1.5">
            <Label htmlFor="comments" className="text-sm font-medium">
              Anything else? <span className="text-xs font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Textarea id="comments" rows={3} value={comments}
              onChange={(e) => setComments(e.target.value)} />
          </div>

          {!remembered && (
            <div className="space-y-1.5 border-t pt-4">
              <Label htmlFor="ident" className="text-sm font-medium">
                The email you signed in with
              </Label>
              <Input id="ident" type="email" inputMode="email" value={identifier}
                onChange={(e) => setIdentifier(e.target.value)} placeholder="you@nhs.net" />
              <p className="text-[11px] text-muted-foreground">
                Used only to record that you have answered, so you are not asked again. It is
                not stored with your answers.
              </p>
            </div>
          )}

          {problem && <p className="text-sm text-destructive">{problem}</p>}

          <Button className="w-full" onClick={submit} disabled={submitting}>
            {submitting
              ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Sending…</>
              : "Send feedback"}
          </Button>
        </CardContent>
      </Card>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <RegisterPageShell>{children}</RegisterPageShell>;
}

function Message({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="space-y-2 py-10 text-center">
        <h1 className="font-display text-lg font-bold">{title}</h1>
        <p className="mx-auto max-w-sm text-sm text-muted-foreground">{children}</p>
      </CardContent>
    </Card>
  );
}
