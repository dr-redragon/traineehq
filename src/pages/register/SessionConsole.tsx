import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import QRCode from "qrcode";
import {
  ArrowLeft, Award, Copy, Download, ExternalLink, FileText, Loader2, Mail, MessageSquare,
  Pencil, RefreshCw, RotateCcw, Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { FeedbackFormEditor } from "@/components/register/FeedbackFormEditor";
import { FeedbackReport } from "@/components/register/FeedbackReport";
import {
  deleteAllFeedback, emailFeedbackLink, fetchFeedback, fetchSessionStatus, previewCertificate,
  resetFeedback, sendCertificate,
} from "@/lib/register/liveApi";
import { CERTIFICATE_OUTCOME } from "@/lib/register/certificateOutcome";
import { feedbackCsv } from "@/lib/register/feedbackCsv";
import { summariseFeedback } from "@/lib/register/feedbackReport";
import { useRegisterDirectory } from "@/hooks/useRegisters";
import type { RegisterAttendee, SendOutcome } from "@/lib/register/types";

const ukDate = (value: string) =>
  new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

/**
 * One teaching day, after the fact.
 *
 * The standalone register put all of this on its own page, reached from the
 * Check-in tab — the day is run on that tab, and everything that happens
 * afterwards happens here: who came, who has answered, who has their
 * certificate, what they said, and the two links that produced any of it. It is
 * its own page for the same reason it was there: the check-in tab is what is on
 * screen while people are arriving, and it should not also be a filing cabinet.
 */
export default function SessionConsole() {
  const { slug } = useParams<{ slug: string }>();
  const [params] = useSearchParams();
  const sessionId = params.get("s") ?? "";
  const queryClient = useQueryClient();

  const { data: directory } = useRegisterDirectory();
  const entry = directory?.find((r) => r.slug === slug);

  const [selected, setSelected] = useState<string[]>([]);
  const [sending, setSending] = useState<"all" | "some" | null>(null);
  const [sendResult, setSendResult] = useState<SendOutcome | null>(null);
  const [issuing, setIssuing] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [wiping, setWiping] = useState(false);
  const [confirmWipe, setConfirmWipe] = useState(false);
  const [editingForm, setEditingForm] = useState(false);
  const [qr, setQr] = useState<{ checkIn: string; feedback: string } | null>(null);

  const status = useQuery({
    queryKey: ["register-session-status", sessionId],
    queryFn: () => fetchSessionStatus(sessionId),
    enabled: !!sessionId,
  });

  const feedback = useQuery({
    queryKey: ["register-feedback", sessionId],
    queryFn: () => fetchFeedback(sessionId),
    enabled: !!sessionId,
  });

  const session = status.data?.session;
  const attendees = status.data?.attendees ?? [];
  const checkedIn = attendees.filter((a) => a.checked_in_at);
  const outstanding = checkedIn.filter((a) => !a.feedback_completed);

  const checkInUrl = sessionId
    ? `${window.location.origin}/registers/checkin?s=${encodeURIComponent(sessionId)}`
    : "";
  const feedbackUrl = sessionId
    ? `${window.location.origin}/registers/feedback?s=${encodeURIComponent(sessionId)}`
    : "";

  useEffect(() => {
    if (!checkInUrl) { setQr(null); return; }
    let alive = true;
    Promise.all([
      QRCode.toDataURL(checkInUrl, { width: 420, margin: 1 }),
      QRCode.toDataURL(feedbackUrl, { width: 420, margin: 1 }),
    ])
      .then(([a, b]) => { if (alive) setQr({ checkIn: a, feedback: b }); })
      .catch(() => { if (alive) setQr(null); });
    return () => { alive = false; };
  }, [checkInUrl, feedbackUrl]);

  const summary = useMemo(
    () => summariseFeedback(feedback.data ?? [], session?.form, checkedIn.length),
    [feedback.data, session?.form, checkedIn.length],
  );

  const copy = (url: string, what: string) => {
    navigator.clipboard.writeText(url)
      .then(() => toast.success(`${what} copied.`))
      .catch(() => toast.error("Could not copy — the link is shown beside the button."));
  };

  const refresh = () => {
    status.refetch();
    feedback.refetch();
  };

  const pushFeedback = async (ids: string[] | null) => {
    if (ids && !ids.length) {
      toast.info("Tick the people you want to email first.");
      return;
    }
    setSending(ids ? "some" : "all");
    setSendResult(null);
    try {
      const result = await emailFeedbackLink({ sessionId, attendeeIds: ids });
      setSendResult(result);
      if (!result.failures.length && !result.sandbox && result.sent) {
        toast.success(`Feedback link sent to ${result.sent}.`);
      }
      await status.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not send the feedback links");
    } finally {
      setSending(null);
    }
  };

  /**
   * Issue one certificate.
   *
   * `force` when they have not given feedback — the organiser overruling the
   * gate for somebody who answered on paper — and asked for out loud, because
   * the gate is what makes the exchange work at all.
   */
  const issue = async (attendee: RegisterAttendee) => {
    if (!attendee.feedback_completed && !window.confirm(
      `${attendee.name} has not given feedback yet. Send their certificate anyway?`,
    )) return;

    setIssuing(attendee.id);
    try {
      const { certificate } = await sendCertificate({
        sessionId, attendeeId: attendee.id, force: true,
      });
      const note = CERTIFICATE_OUTCOME[certificate];
      if (certificate === "sent") toast.success(note(attendee.name));
      else toast.warning(note(attendee.name));
      await status.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not send the certificate");
    } finally {
      setIssuing(null);
    }
  };

  const showPreview = async () => {
    if (!entry) return;
    setPreviewing(true);
    try {
      const { pdf_base64 } = await previewCertificate({ registerId: entry.id, sessionId });
      const bytes = Uint8Array.from(atob(pdf_base64), (c) => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
      setPreview(url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not draw the certificate");
    } finally {
      setPreviewing(false);
    }
  };

  const closePreview = () => {
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
  };

  const wipe = async () => {
    setWiping(true);
    try {
      const { deleted } = await deleteAllFeedback(sessionId);
      setConfirmWipe(false);
      toast.success(
        `Deleted ${deleted} response${deleted === 1 ? "" : "s"}. Everyone can answer again; ` +
        "certificates already sent are unchanged.",
      );
      await Promise.all([status.refetch(), feedback.refetch()]);
      queryClient.invalidateQueries({ queryKey: ["register-feedback", sessionId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete the feedback");
    } finally {
      setWiping(false);
    }
  };

  const downloadCsv = () => {
    if (!feedback.data?.length || !session) return;
    const blob = new Blob([feedbackCsv(feedback.data, session.form)], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `feedback-${session.session_date}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (!sessionId) {
    return <Missing slug={slug}>This link is missing its teaching day.</Missing>;
  }
  if (status.isLoading) return <Skeleton className="h-96 w-full" />;
  if (status.isError || !session) {
    return (
      <Missing slug={slug}>
        {(status.error as Error)?.message ?? "That teaching day no longer exists."}
      </Missing>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3 print:hidden">
        <div className="min-w-0">
          <Button asChild variant="ghost" size="sm" className="-ml-2 mb-1 h-7 text-xs">
            <Link to={`/registers/${slug}`}>
              <ArrowLeft className="mr-1.5 h-3.5 w-3.5" /> Back to the register
            </Link>
          </Button>
          <h1 className="font-display text-xl font-bold tracking-tight sm:text-2xl">
            {session.title}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {ukDate(session.session_date)}{session.location ? ` · ${session.location}` : ""}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={refresh}
          disabled={status.isFetching || feedback.isFetching}>
          <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${
            status.isFetching || feedback.isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* --------------------------------------------------------- the links */}
      <div className="grid gap-4 sm:grid-cols-2">
        <LinkCard
          heading="Sign in — show this on the day"
          qr={qr?.checkIn} url={checkInUrl} label="Sign-in link"
          onCopy={() => copy(checkInUrl, "Sign-in link")}
        />
        <LinkCard
          heading="Feedback — share at the end"
          qr={qr?.feedback} url={feedbackUrl} label="Feedback link"
          onCopy={() => copy(feedbackUrl, "Feedback link")}
          extra={
            <Button size="sm" variant="ghost" onClick={() => setEditingForm(true)}>
              <Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit form
            </Button>
          }
        />
      </div>

      {/* ---------------------------------------- attendance and certificates */}
      <Card>
        <CardContent className="space-y-4 p-4">
          <h2 className="font-display text-base font-bold">Attendance and certificates</h2>

          <EmailStatus status={status.data} />

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat n={checkedIn.length} label="Signed in" />
            <Stat n={attendees.filter((a) => a.feedback_completed).length} label="Feedback given" />
            <Stat n={attendees.filter((a) => a.certificate_sent_at).length} label="Certificates sent" />
            <Stat n={checkedIn.filter((a) => !a.certificate_sent_at).length}
              label="Still awaiting one" />
          </div>

          {sendResult && (
            <Alert variant={sendResult.failures.length ? "destructive" : "default"}>
              <AlertDescription className="space-y-1 text-xs">
                <p>
                  Feedback link emailed to {sendResult.sent} of {sendResult.considered}{" "}
                  outstanding.
                </p>
                {sendResult.failures.length > 0 && (
                  <ul className="ml-4 list-disc">
                    {sendResult.failures.map((f, i) => (
                      <li key={i}>{f.name ? `${f.name} — ` : ""}{f.why}</li>
                    ))}
                  </ul>
                )}
                {!sendResult.failures.length && sendResult.sandbox && (
                  <p><strong>
                    But the sender is still the provider's test address, so only the account
                    holder actually receives them.
                  </strong></p>
                )}
              </AlertDescription>
            </Alert>
          )}

          {!checkedIn.length ? (
            <p className="text-sm text-muted-foreground">Nobody has signed in yet.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full min-w-[720px] border-collapse text-sm">
                <thead>
                  <tr className="border-b bg-muted text-left text-[11px] uppercase tracking-wider [&_th]:px-3 [&_th]:py-2.5 [&_th]:font-bold">
                    <th className="w-9">
                      <Checkbox
                        aria-label="Select everyone"
                        checked={selected.length > 0 && selected.length === outstanding.length}
                        onCheckedChange={(on) =>
                          setSelected(on === true ? outstanding.map((a) => a.id) : [])}
                      />
                    </th>
                    <th>Trainee</th>
                    <th>Grade</th>
                    <th>Email</th>
                    <th>Signed in</th>
                    <th>Feedback</th>
                    <th>Certificate</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {checkedIn.map((a) => (
                    <tr key={a.id} className="border-b last:border-0 [&_td]:px-3 [&_td]:py-2">
                      <td>
                        <Checkbox
                          aria-label={`Select ${a.name}`}
                          disabled={a.feedback_completed}
                          checked={selected.includes(a.id)}
                          onCheckedChange={(on) => setSelected((s) =>
                            on === true ? [...s, a.id] : s.filter((id) => id !== a.id))}
                        />
                      </td>
                      <td className="whitespace-nowrap font-medium">{a.name}</td>
                      <td className="text-muted-foreground">{a.grade || "—"}</td>
                      <td className="max-w-[220px] truncate text-xs text-muted-foreground">
                        {a.email.endsWith("@no-email.invalid") ? "— none on file —" : a.email}
                      </td>
                      <td>
                        <Badge variant="secondary" className="text-[10px]">Yes</Badge>
                      </td>
                      <td>
                        <Badge variant={a.feedback_completed ? "default" : "outline"}
                          className="text-[10px]">
                          {a.feedback_completed ? "Given" : "Not yet"}
                        </Badge>
                      </td>
                      <td>
                        <Badge
                          variant={a.certificate_sent_at ? "default" : "outline"}
                          className="text-[10px]"
                        >
                          {a.certificate_sent_at ? "Sent"
                            : a.feedback_completed ? "Due" : "Gated"}
                        </Badge>
                      </td>
                      <td className="whitespace-nowrap text-right">
                        <Button size="sm" variant="ghost" className="h-7 text-xs"
                          disabled={issuing === a.id} onClick={() => issue(a)}>
                          {issuing === a.id
                            ? <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                            : <Award className="mr-1.5 h-3 w-3" />}
                          {a.certificate_sent_at ? "Resend" : "Send now"}
                        </Button>
                        {a.feedback_completed && (
                          <Button
                            size="icon" variant="ghost" className="h-7 w-7"
                            title={`Let ${a.name} answer again`}
                            aria-label={`Let ${a.name} answer again`}
                            onClick={async () => {
                              try {
                                await resetFeedback(sessionId, a.id);
                                toast.success(`${a.name} can answer again.`);
                                status.refetch();
                              } catch (e) {
                                toast.error(e instanceof Error ? e.message : "Could not reset it");
                              }
                            }}
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => pushFeedback(null)}
              disabled={sending !== null || !outstanding.length || !status.data?.email_configured}>
              {sending === "all"
                ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                : <Mail className="mr-1.5 h-3.5 w-3.5" />}
              Email the feedback link to everyone outstanding ({outstanding.length})
            </Button>
            <Button size="sm" variant="outline" onClick={() => pushFeedback(selected)}
              disabled={sending !== null || !status.data?.email_configured}>
              Email selected ({selected.length})
            </Button>
            <Button size="sm" variant="outline" onClick={showPreview} disabled={previewing}>
              {previewing
                ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                : <FileText className="mr-1.5 h-3.5 w-3.5" />}
              Preview the certificate
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* -------------------------------------------------------- the report */}
      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-1.5 font-display text-base font-bold">
              <MessageSquare className="h-4 w-4" /> Feedback report
            </h2>
            <Button size="sm" variant="outline" onClick={downloadCsv}
              disabled={!feedback.data?.length}>
              <Download className="mr-1.5 h-3.5 w-3.5" /> Download responses (CSV)
            </Button>
          </div>

          {feedback.isLoading
            ? <Skeleton className="h-40 w-full" />
            : <FeedbackReport summary={summary} />}
        </CardContent>
      </Card>

      {/* ------------------------------------------------------ deleting them */}
      <Card className="border-destructive/40">
        <CardContent className="space-y-2 p-4">
          <h2 className="font-display text-base font-bold text-destructive">Delete feedback</h2>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Removes <strong>every</strong> response for {session.title} — not one person's, and
            there is no undo. Because a response carries no name, there is no way to delete one
            on its own; this is the only way to clear a test run or a question asked wrongly.
            Everyone can then answer again. Certificates already sent are unchanged.
          </p>
          <Button size="sm" variant="destructive" onClick={() => setConfirmWipe(true)}
            disabled={!feedback.data?.length}>
            <Trash2 className="mr-1.5 h-3.5 w-3.5" />
            Delete all feedback for this teaching day
          </Button>
        </CardContent>
      </Card>

      <Dialog open={confirmWipe} onOpenChange={setConfirmWipe}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-destructive">Delete all feedback?</DialogTitle>
            <DialogDescription>
              This deletes all {feedback.data?.length ?? 0}{" "}
              response{feedback.data?.length === 1 ? "" : "s"} for {session.title}. There is no
              undo. Everyone can answer again; certificates already sent are unchanged.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirmWipe(false)}>
              Keep the feedback
            </Button>
            <Button variant="destructive" onClick={wipe} disabled={wiping}>
              {wiping && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Yes, delete {feedback.data?.length ?? 0}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!preview} onOpenChange={(open) => { if (!open) closePreview(); }}>
        <DialogContent className="max-h-[92vh] max-w-4xl">
          <DialogHeader><DialogTitle>Certificate preview</DialogTitle></DialogHeader>
          {preview && (
            <>
              <iframe title="Certificate preview" src={preview}
                className="h-[60vh] w-full rounded border" />
              <p className="text-xs text-muted-foreground">
                If nothing appears above, open or download it — some phone browsers cannot show
                a PDF inline.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button asChild size="sm">
                  <a href={preview} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="mr-1.5 h-3.5 w-3.5" /> Open in a new tab
                  </a>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <a href={preview} download="certificate-preview.pdf">
                    <Download className="mr-1.5 h-3.5 w-3.5" /> Download PDF
                  </a>
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {entry && (
        <Dialog open={editingForm} onOpenChange={setEditingForm}>
          <DialogContent className="max-h-[92vh] max-w-6xl overflow-y-auto">
            <DialogHeader><DialogTitle>Feedback form</DialogTitle></DialogHeader>
            <FeedbackFormEditor
              registerId={entry.id}
              sessionId={sessionId}
              sessionTitle={session.title}
              onClose={() => setEditingForm(false)}
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <div className="rounded-lg border bg-card px-3 py-2.5">
      <p className="font-display text-xl font-bold tabular-nums">{n}</p>
      <p className="text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}

function LinkCard({
  heading, qr, url, label, onCopy, extra,
}: {
  heading: string;
  qr: string | undefined;
  url: string;
  label: string;
  onCopy: () => void;
  extra?: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="space-y-3 p-4 text-center">
        <p className="text-sm font-semibold">{heading}</p>
        {qr
          ? <img src={qr} alt={`QR code for the ${label.toLowerCase()}`}
              className="mx-auto h-44 w-44 rounded-lg border bg-white p-2" />
          : <Skeleton className="mx-auto h-44 w-44" />}
        <p className="break-all rounded bg-muted px-2 py-1 text-[10px] text-muted-foreground">
          {url}
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button asChild size="sm" variant="outline">
            <a href={url} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="mr-1.5 h-3.5 w-3.5" /> Open
            </a>
          </Button>
          <Button size="sm" variant="outline" onClick={onCopy}>
            <Copy className="mr-1.5 h-3.5 w-3.5" /> Copy
          </Button>
          {extra}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Whether mail can leave at all — said before a button is pressed, and said
 * even when it is working, so an organiser can see where replies will land.
 */
function EmailStatus({ status }: { status: { email_configured: boolean; email_sandbox: boolean; email_from: string; email_reply_to: string[] } | undefined }) {
  if (!status) return null;

  if (!status.email_configured) {
    return (
      <Alert variant="destructive">
        <AlertDescription className="text-xs">
          Email is not configured, so nothing can be sent and certificates are not being issued.
          Set <code className="mx-1">RESEND_API_KEY</code> in Supabase → Edge Functions → Secrets.
        </AlertDescription>
      </Alert>
    );
  }

  if (status.email_sandbox) {
    return (
      <Alert>
        <AlertDescription className="text-xs">
          <strong>Trainees will not receive these.</strong> Mail is going out as{" "}
          <code>{status.email_from}</code>, the provider's shared test address, which delivers
          only to the account holder. Verify a domain and set <code>RESEND_FROM</code> to an
          address at it.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <p className="text-xs text-muted-foreground">
      Sending as {status.email_from}
      {status.email_reply_to.length
        ? ` · replies go to ${status.email_reply_to.join(", ")}`
        : " · no reply-to set, so replies bounce"}
    </p>
  );
}

function Missing({ slug, children }: { slug?: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="space-y-4 py-10 text-center">
        <p className="text-sm text-muted-foreground">{children}</p>
        <Button asChild variant="outline" size="sm">
          <Link to={slug ? `/registers/${slug}` : "/registers"}>
            <ArrowLeft className="mr-1.5 h-3.5 w-3.5" /> Back to the register
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
