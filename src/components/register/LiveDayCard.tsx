import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Award, ClipboardList, Copy, ExternalLink, Loader2, Mail, Pencil, Radio, RefreshCw, RotateCcw,
} from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  emailFeedbackLink, fetchSessionStatus, publishSession, resetFeedback, sendCertificate,
} from "@/lib/register/liveApi";
import { CERTIFICATE_OUTCOME } from "@/lib/register/certificateOutcome";
import { describeSync, mergeCheckIns } from "@/lib/register/liveSync";
import { certificateFilename, renderCertificatePdf } from "@/lib/register/certificate";
import { registerLogoUrl } from "@/lib/register/logo";
import { useRegister } from "@/contexts/RegisterContext";
import type { RegisterEdit } from "@/hooks/useRegisterStore";
import type {
  LiveSession, RegisterAttendee, RegisterBlob, RegisterSession, SendOutcome,
} from "@/lib/register/types";

/** The first of the month, as a sensible default for a day in that month. */
const firstOf = (month: string) => `${month}-01`;

const ukDate = (value: string) =>
  new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

/**
 * Everything a published teaching day can do: the sign-in link, the feedback
 * form, the certificates, and the repair button that reconciles the two halves.
 *
 * Grouped in the order the day actually runs — publish, then on the day, then
 * afterwards — rather than as one undifferentiated row of controls.
 */
export function LiveDayCard({
  blob, registerId, registerSlug, session, live, onEdit, onPublished, pushAllPresent, onEditForm,
}: {
  blob: RegisterBlob;
  registerId: string;
  /** For the link through to this teaching day's own console. */
  registerSlug: string;
  /** The day in the register blob. */
  session: RegisterSession;
  /** Its published counterpart, once there is one. */
  live: LiveSession | undefined;
  onEdit: (edit: RegisterEdit) => void;
  onPublished?: () => void;
  pushAllPresent: (liveSessionId: string, localSessionId: string) => Promise<number>;
  onEditForm: () => void;
}) {
  const queryClient = useQueryClient();
  const { activeRegister } = useRegister();

  const [date, setDate] = useState(firstOf(session.month));
  const [location, setLocation] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [sendResult, setSendResult] = useState<SendOutcome | null>(null);
  const [sending, setSending] = useState<"all" | "some" | null>(null);
  const [issuing, setIssuing] = useState<string | null>(null);
  const [emailingCerts, setEmailingCerts] = useState(false);

  const { data: status, isFetching, refetch } = useQuery({
    queryKey: ["register-session-status", live?.id],
    queryFn: () => fetchSessionStatus(live!.id),
    enabled: !!live?.id,
    // A teaching day is watched while people are arriving, so this polls rather
    // than waiting to be told. Thirty seconds feels live without hammering a
    // function on a cold isolate.
    refetchInterval: 30_000,
  });

  const attendees = (status?.attendees ?? []).filter((a) => a.checked_in_at);
  const outstanding = attendees.filter((a) => !a.feedback_completed);

  /**
   * Publish, then immediately push everything the register already holds.
   *
   * This is the case the original got wrong: making a past teaching day live to
   * collect feedback produced an empty sign-in list next to a grid full of
   * ticks, and nobody who had actually attended could be sent the form.
   */
  const publish = useMutation({
    mutationFn: async () => {
      const result = await publishSession({
        registerId, title: session.title, sessionDate: date || firstOf(session.month),
        location: location.trim() || null, localId: session.id,
      });
      const pushed = await pushAllPresent(result.session.id, session.id).catch(() => 0);
      return { ...result, pushed };
    },
    onSuccess: ({ created, pushed }) => {
      queryClient.invalidateQueries({ queryKey: ["register-live-sessions", registerId] });
      onPublished?.();
      toast.success(created ? "Published — the sign-in link is live." : "Updated.", {
        description: pushed
          ? `${pushed} already marked present ${pushed === 1 ? "is" : "are"} on the live list too.`
          : undefined,
      });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  /**
   * Reconcile both directions in one press.
   *
   * Push first — everyone the grid has and the live list does not, including
   * every tick made before the day was published — then pull, folding sign-ins
   * back into the grid and enrolling anybody who typed a name that was not on
   * the roster.
   */
  const resync = async () => {
    if (!live) return;
    setSyncing(true);
    setSyncMessage("Syncing sign-ins…");
    try {
      const pushed = await pushAllPresent(live.id, session.id).catch(() => 0);
      const fresh = await fetchSessionStatus(live.id);

      const preview = mergeCheckIns(blob, session.id, fresh.attendees);
      if (preview.added || preview.regraded || preview.emailed || preview.enrolled.length) {
        // Applied as a function of whatever blob is current, not of the one
        // read above: `useRegisterStore` replays this if somebody else saves
        // first, and replaying a snapshot would undo their edit.
        onEdit((current) => mergeCheckIns(current, session.id, fresh.attendees).blob);
      }
      queryClient.setQueryData(["register-session-status", live.id], fresh);
      setSyncMessage(describeSync(preview, pushed));
    } catch (e) {
      setSyncMessage(e instanceof Error ? e.message : "Could not reach the live sign-in list.");
    } finally {
      setSyncing(false);
    }
  };

  const sendFeedbackLinks = async (ids: string[] | null) => {
    if (!live) return;
    if (ids && !ids.length) {
      toast.info("Tick at least one person, or send to everyone outstanding.");
      return;
    }
    setSending(ids ? "some" : "all");
    setSendResult(null);
    try {
      const result = await emailFeedbackLink({ sessionId: live.id, attendeeIds: ids });
      setSendResult(result);
      if (!result.failures.length && !result.sandbox && result.sent) {
        toast.success(`Feedback link sent to ${result.sent}.`);
      }
      await refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not send the feedback links");
    } finally {
      setSending(null);
    }
  };

  // ------------------------------------------------------------ certificates

  const detailsFor = (attendee: RegisterAttendee) => ({
    traineeName: attendee.name,
    registerName: activeRegister?.name ?? "Teaching register",
    deaneryName: activeRegister?.deanery_name ?? "",
    sessionTitle: live?.title ?? session.title,
    sessionDate: live?.session_date ?? "",
    location: live?.location ?? null,
    logoUrl: registerLogoUrl(activeRegister?.certificate_logo_path),
  });

  /**
   * Certificates are drawn in the browser: pdf-lib is about a megabyte, and
   * paying that on an edge function's cold start — for a document the organiser
   * is standing there waiting for — buys nothing.
   */
  const downloadCertificate = async (attendee: RegisterAttendee) => {
    setIssuing(attendee.id);
    try {
      const details = detailsFor(attendee);
      const bytes = await renderCertificatePdf(details);
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = certificateFilename(details);
      link.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not make the certificate");
    } finally {
      setIssuing(null);
    }
  };

  /**
   * Catch up anyone still owed a certificate.
   *
   * Ordinarily nobody is: submitting the feedback issues it, server-side, at
   * the moment it is earned. This is the repair path — for a day whose feedback
   * came in before that worked, or a send that failed on a bad address since
   * corrected.
   *
   * One request per person rather than one batch: a bad address for one trainee
   * should not cost the other nineteen theirs, and the organiser wants to know
   * which one failed.
   */
  const emailCertificates = async () => {
    if (!live) return;
    const eligible = attendees.filter((a) => a.feedback_completed && !a.certificate_sent_at);
    if (!eligible.length) {
      toast.info("Nobody is waiting for a certificate on this teaching day.");
      return;
    }

    setEmailingCerts(true);
    let sent = 0;
    const failures: string[] = [];

    for (const attendee of eligible) {
      try {
        const { certificate } = await sendCertificate({
          sessionId: live.id, attendeeId: attendee.id,
        });
        if (certificate === "sent") sent++;
        else if (certificate !== "already_sent") {
          failures.push(CERTIFICATE_OUTCOME[certificate](attendee.name));
        }
      } catch (e) {
        failures.push(`${attendee.name}: ${e instanceof Error ? e.message : "failed"}`);
      }
    }

    setEmailingCerts(false);
    await refetch();
    if (sent) toast.success(`${sent} certificate${sent === 1 ? "" : "s"} sent.`);
    if (failures.length) {
      toast.error(failures[0], {
        description: failures.length > 1 ? `and ${failures.length - 1} more` : undefined,
      });
    }
  };

  // ------------------------------------------------------------------ render

  const checkInUrl = live
    ? `${window.location.origin}/registers/checkin?s=${encodeURIComponent(live.id)}`
    : "";
  const feedbackUrl = live
    ? `${window.location.origin}/registers/feedback?s=${encodeURIComponent(live.id)}`
    : "";

  const copy = (url: string, what: string) => {
    navigator.clipboard.writeText(url)
      .then(() => toast.success(`${what} copied.`))
      .catch(() => toast.error("Could not copy — select the link and copy it by hand."));
  };

  if (!live) {
    const alreadyPresent = blob.trainees.filter(
      (t) => !!blob.attendance[`${t.id}|${session.id}`],
    ).length;

    return (
      <Card>
        <CardContent className="space-y-3 p-4">
          <Label className="text-xs">Live sign-in, feedback &amp; certificates</Label>
          <p className="text-sm text-muted-foreground">
            Publish <strong>{session.title}</strong> to get a QR sign-in page, a feedback link
            and certificates.
            {alreadyPresent > 0 && (
              <> The {alreadyPresent} already marked present here will be put on the live list
                as it publishes, so they can be sent the form.</>
            )}
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="publish-date" className="text-xs">Date of the teaching day</Label>
              <Input id="publish-date" type="date" value={date}
                onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="publish-loc" className="text-xs">Location (optional)</Label>
              <Input id="publish-loc" value={location} placeholder="e.g. Wythenshawe Hospital"
                onChange={(e) => setLocation(e.target.value)} />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={() => publish.mutate()} disabled={publish.isPending}>
              {publish.isPending
                ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                : <Radio className="mr-1.5 h-4 w-4" />}
              Publish this teaching day
            </Button>
            <Button variant="outline" onClick={onEditForm}>
              <Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit the feedback form template
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            A published day starts from the template, then can be edited on its own.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge className="bg-success text-success-foreground">Live</Badge>
          <span className="text-xs text-muted-foreground">
            {attendees.length} signed in · {status?.feedback_count ?? 0} feedback ·{" "}
            {attendees.filter((a) => a.certificate_sent_at).length} certificates sent
          </span>
          <Button size="sm" variant="ghost" className="ml-auto h-7 text-xs"
            onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        {status && !status.email_configured && (
          <Alert variant="destructive">
            <AlertDescription className="text-xs">
              Email is not configured, so feedback links and certificates cannot be sent. Set
              <code className="mx-1">RESEND_API_KEY</code> in Supabase → Edge Functions → Secrets.
            </AlertDescription>
          </Alert>
        )}
        {status?.email_configured && status.email_sandbox && (
          <Alert>
            <AlertDescription className="text-xs">
              <strong>Trainees will not receive these.</strong> Mail is still going out as{" "}
              <code>{status.email_from}</code>, the provider's shared test address, which delivers
              only to the account holder. Verify a domain and set{" "}
              <code>RESEND_FROM</code> to an address at it.
            </AlertDescription>
          </Alert>
        )}
        {/* Said when it is working too, so an organiser can see where a
            trainee's reply will land before one of them replies. */}
        {status?.email_configured && !status.email_sandbox && (
          <p className="text-[11px] text-muted-foreground">
            Sending as {status.email_from}
            {status.email_reply_to.length
              ? ` · replies go to ${status.email_reply_to.join(", ")}`
              : " · no reply-to set, so replies bounce"}
          </p>
        )}

        {/* ------------------------------------------------------ on the day */}
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            On the day
          </p>
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm" variant="outline">
              <a href={checkInUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="mr-1.5 h-3.5 w-3.5" /> Open sign-in page
              </a>
            </Button>
            <Button size="sm" variant="outline" onClick={() => copy(checkInUrl, "Sign-in link")}>
              <Copy className="mr-1.5 h-3.5 w-3.5" /> Copy sign-in link
            </Button>
            <Button size="sm" variant="ghost" onClick={resync} disabled={syncing}>
              {syncing
                ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                : <RotateCcw className="mr-1.5 h-3.5 w-3.5" />}
              Re-sync sign-ins
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {syncMessage ?? (
              <>
                This is the page the QR opens. Anyone whose name is not on the list types it and
                joins the roster on the spot. Sign-ins reach the attendance grid on their own —
                re-sync is the repair button, and it pushes anything ticked here that never
                reached the live list.
              </>
            )}
          </p>
        </div>

        {/* -------------------------------------------------- after the day */}
        <div className="space-y-2 border-t pt-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            After the session
          </p>
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm" variant="outline">
              <a href={feedbackUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="mr-1.5 h-3.5 w-3.5" /> Open feedback form
              </a>
            </Button>
            <Button size="sm" variant="outline" onClick={() => copy(feedbackUrl, "Feedback link")}>
              <Copy className="mr-1.5 h-3.5 w-3.5" /> Copy feedback link
            </Button>
            <Button size="sm" variant="outline" onClick={onEditForm}>
              <Pencil className="mr-1.5 h-3.5 w-3.5" /> Design the form
            </Button>
            {/* Everything for afterwards behind one door, rather than scattered
                across this card as well: who came, who has answered, who has
                their certificate, and what the cohort said. */}
            <Button asChild size="sm">
              <Link to={`/registers/${registerSlug}/day?s=${encodeURIComponent(live.id)}`}>
                <ClipboardList className="mr-1.5 h-3.5 w-3.5" /> Feedback &amp; certificates
              </Link>
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button size="sm" onClick={() => sendFeedbackLinks(null)}
              disabled={sending !== null || !outstanding.length || !status?.email_configured}>
              {sending === "all"
                ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                : <Mail className="mr-1.5 h-3.5 w-3.5" />}
              Email all outstanding ({outstanding.length})
            </Button>
            <Button size="sm" variant="outline" onClick={() => sendFeedbackLinks(selected)}
              disabled={sending !== null || !status?.email_configured}>
              {sending === "some" && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Email selected ({selected.length})
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Emails the form to people who signed in. Completing it releases their certificate.
            Anyone who has already answered is skipped.
          </p>

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
        </div>

        {/* --------------------------------------------------- the attendees */}
        <div className="space-y-2 border-t pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Signed in
            </p>
            <Badge variant="secondary">{attendees.length}</Badge>
            {attendees.some((a) => a.feedback_completed && !a.certificate_sent_at) && (
              <Button size="sm" variant="outline" className="ml-auto h-7 text-xs"
                onClick={emailCertificates} disabled={emailingCerts}>
                {emailingCerts
                  ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  : <Award className="mr-1.5 h-3.5 w-3.5" />}
                Email certificates (
                {attendees.filter((a) => a.feedback_completed && !a.certificate_sent_at).length})
              </Button>
            )}
          </div>

          {!status ? (
            <Skeleton className="h-24 w-full" />
          ) : !attendees.length ? (
            <p className="text-sm text-muted-foreground">Nobody has signed in yet.</p>
          ) : (
            <div className="max-h-[340px] divide-y overflow-y-auto rounded-lg border">
              {attendees.map((a) => (
                <div key={a.id} className="flex items-center gap-2 px-3 py-2">
                  <Checkbox
                    checked={selected.includes(a.id)}
                    disabled={a.feedback_completed}
                    aria-label={`Select ${a.name}`}
                    onCheckedChange={(on) => setSelected((s) =>
                      on === true ? [...s, a.id] : s.filter((id) => id !== a.id))}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{a.name}</p>
                    <p className="truncate text-[11px] text-muted-foreground">{a.grade ?? ""}</p>
                  </div>
                  <Badge variant={a.feedback_completed ? "default" : "outline"}
                    className="text-[10px]">
                    {a.feedback_completed ? "Feedback in" : "No feedback"}
                  </Badge>
                  <Badge
                    variant={a.certificate_sent_at ? "default" : "outline"}
                    className="hidden text-[10px] sm:inline-flex"
                  >
                    {a.certificate_sent_at ? "Cert sent"
                      : a.feedback_completed ? "Cert due" : "Gated"}
                  </Badge>
                  {/* Feedback first, as the original required: the certificate
                      is what the feedback is exchanged for. */}
                  <Button
                    size="icon" variant="ghost" className="h-7 w-7"
                    disabled={!a.feedback_completed || issuing === a.id}
                    title={a.feedback_completed
                      ? `Download the certificate for ${a.name}`
                      : `${a.name} has not given feedback yet`}
                    aria-label={`Certificate for ${a.name}`}
                    onClick={() => downloadCertificate(a)}
                  >
                    <Award className="h-3.5 w-3.5" />
                  </Button>
                  {a.feedback_completed && (
                    <Button
                      size="icon" variant="ghost" className="h-7 w-7"
                      title={`Let ${a.name} fill the form in again`}
                      aria-label={`Let ${a.name} answer again`}
                      onClick={async () => {
                        try {
                          await resetFeedback(live.id, a.id);
                          toast.success(`${a.name} can answer again.`);
                          refetch();
                        } catch (e) {
                          toast.error(e instanceof Error ? e.message : "Could not reset it");
                        }
                      }}
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
          <p className="text-[11px] text-muted-foreground">
            {live.title} · {ukDate(live.session_date)}
            {live.location ? ` · ${live.location}` : ""}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
