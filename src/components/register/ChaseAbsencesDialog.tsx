import { useEffect, useMemo, useState } from "react";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { chaseAbsences } from "@/lib/register/liveApi";
import {
  EMAIL_PATTERN, defaultChaseBody, defaultChaseSubject, splitByEmail, unexplainedAbsentees,
} from "@/lib/register/chase";
import type { RegisterBlob, RegisterSession, SendOutcome } from "@/lib/register/types";

/** Reply addresses are the same three or four every time, so they are kept. */
const repliesKey = (registerId: string) => `register-chase-replies:${registerId}`;

function savedReplies(registerId: string): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(repliesKey(registerId)) ?? "[]");
    return Array.isArray(raw) ? raw.filter((v) => typeof v === "string") : [];
  } catch {
    return [];
  }
}

/**
 * The chaser email: asking the people down as absent, with no reason recorded,
 * why they were not there.
 *
 * Two things it does deliberately. Everyone goes in BCC, so a trainee cannot
 * see who else missed the day — an absence can be a miscarriage or a
 * disciplinary, and the list is not the organiser's to circulate. And the
 * people with no address on file are named on screen before anything is sent,
 * rather than quietly dropped and reported afterwards as a smaller count.
 */
export function ChaseAbsencesDialog({
  open, onOpenChange, blob, session, liveSessionId, registerId, registerName, sandboxFrom,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  blob: RegisterBlob;
  session: RegisterSession;
  /** The published teaching day. Chasing needs one — the send is scoped to it. */
  liveSessionId: string;
  registerId: string;
  registerName?: string;
  /** Set while mail still goes out from the provider's shared test address. */
  sandboxFrom?: string | null;
}) {
  const absent = useMemo(() => unexplainedAbsentees(blob, session), [blob, session]);
  const { withEmail, withoutEmail } = useMemo(() => splitByEmail(absent), [absent]);

  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [replies, setReplies] = useState<string[]>(["", "", "", ""]);
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState("");
  const [outcome, setOutcome] = useState<SendOutcome | null>(null);

  // Re-drafted each time it opens: the draft belongs to this teaching day, and
  // a half-edited message from the last one would be worse than a blank slate.
  useEffect(() => {
    if (!open) return;
    setSubject(defaultChaseSubject(session));
    setBody(defaultChaseBody(session, registerName));
    const saved = savedReplies(registerId);
    setReplies([0, 1, 2, 3].map((i) => saved[i] ?? ""));
    setProblem("");
    setOutcome(null);
  }, [open, session, registerName, registerId]);

  const replyList = replies.map((r) => r.trim()).filter(Boolean);

  const send = async () => {
    if (!subject.trim()) { setProblem("Give the email a subject."); return; }
    if (!body.trim()) { setProblem("The message is empty."); return; }
    const bad = replyList.find((r) => !EMAIL_PATTERN.test(r));
    if (bad) { setProblem(`“${bad}” is not a valid reply address.`); return; }
    if (!withEmail.length) { setProblem("Nobody to send to."); return; }

    setProblem("");
    setSending(true);
    try {
      try {
        localStorage.setItem(repliesKey(registerId), JSON.stringify(replyList));
      } catch { /* a convenience, never a reason to fail the send */ }

      const result = await chaseAbsences({
        sessionId: liveSessionId,
        recipients: withEmail.map((t) => (t.email ?? "").trim()),
        subject: subject.trim(),
        body: body.trim(),
        replyTo: replyList,
      });
      setOutcome(result);
      if (!result.failures.length && !result.sandbox) {
        toast.success(`Chaser sent to ${result.sent}.`);
      }
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "Could not send it.");
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Ask about absences — {session.title}</DialogTitle>
          <DialogDescription>
            {withEmail.length} {withEmail.length === 1 ? "trainee" : "trainees"}, all in BCC —
            none of them can see the others.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-wrap gap-1.5">
            {withEmail.map((t) => (
              <Badge key={t.id} variant="secondary" className="text-[11px]">{t.name}</Badge>
            ))}
          </div>

          {withoutEmail.length > 0 && (
            <Alert variant="destructive">
              <AlertDescription className="text-xs">
                <strong>
                  {withoutEmail.length} will not be emailed — no address on file:
                </strong>{" "}
                {withoutEmail.map((t) => t.name).join(", ")}. Add their emails under{" "}
                <em>Trainees &amp; days</em>, then reopen this to include them.
              </AlertDescription>
            </Alert>
          )}

          {sandboxFrom && (
            <Alert>
              <AlertDescription className="text-xs">
                <strong>These will not reach anyone yet.</strong> Mail is still going out as{" "}
                <code>{sandboxFrom}</code>, the provider's shared test address, which delivers
                only to the account holder.
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="chase-subject" className="text-xs">Subject</Label>
            <Input id="chase-subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="chase-body" className="text-xs">Message</Label>
            <Textarea id="chase-body" rows={10} value={body}
              onChange={(e) => setBody(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">
              Reply-to addresses{" "}
              <span className="font-normal text-muted-foreground">
                (where their answers land — any mailbox, not just the sending domain)
              </span>
            </Label>
            <div className="grid gap-2 sm:grid-cols-2">
              {replies.map((value, i) => (
                <Input
                  key={i}
                  type="email"
                  inputMode="email"
                  value={value}
                  placeholder={`reply address ${i + 1}${i ? " (optional)" : ""}`}
                  onChange={(e) => setReplies(
                    (r) => r.map((v, j) => (j === i ? e.target.value : v)),
                  )}
                />
              ))}
            </div>
          </div>

          {problem && <p className="text-sm text-destructive">{problem}</p>}

          {outcome && (
            <Alert variant={outcome.failures.length ? "destructive" : "default"}>
              <AlertDescription className="space-y-1 text-xs">
                <p>Sent to {outcome.sent} of {outcome.considered}, all in BCC.</p>
                {outcome.not_on_roster ? (
                  <p>
                    {outcome.not_on_roster} address{outcome.not_on_roster === 1 ? " was" : "es were"}{" "}
                    not on the register's roster and were not sent to.
                  </p>
                ) : null}
                {outcome.failures.map((f, i) => <p key={i}>{f.why}</p>)}
                {!outcome.failures.length && outcome.sandbox && (
                  <p>
                    <strong>
                      But the sender is still the provider's test address, so only the account
                      holder actually received it.
                    </strong>
                  </p>
                )}
              </AlertDescription>
            </Alert>
          )}

          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
            <Button onClick={send} disabled={sending || !withEmail.length}>
              {sending
                ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Sending…</>
                : <><Send className="mr-1.5 h-4 w-4" /> Send</>}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
