import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import QRCode from "qrcode";
import { Check, Copy, ExternalLink, RefreshCw, Radio, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  fetchLiveSessions, fetchSessionStatus, markAttended, publishSession,
} from "@/lib/register/liveApi";
import { formatMonth, sessionsSorted } from "@/lib/register/months";
import { isPresent } from "@/lib/register/attendance";
import { isFormerTrainee } from "@/lib/register/eligibility";
import type { RegisterBlob } from "@/lib/register/types";

/** The first of the month, as a sensible default for a day in that month. */
function firstOf(month: string): string {
  return `${month}-01`;
}

export function LiveSessionPanel({
  blob, registerId,
}: {
  blob: RegisterBlob;
  registerId: string;
}) {
  const queryClient = useQueryClient();
  const [localId, setLocalId] = useState("");
  const [date, setDate] = useState("");
  const [qr, setQr] = useState<string | null>(null);

  const days = useMemo(() => [...sessionsSorted(blob.sessions)].reverse(), [blob.sessions]);

  const { data: published, isLoading } = useQuery({
    queryKey: ["register-live-sessions", registerId],
    queryFn: () => fetchLiveSessions(registerId),
    enabled: !!registerId,
  });

  const publishedFor = (blobSessionId: string) =>
    published?.find((s) => s.local_id === blobSessionId);

  const selected = localId ? publishedFor(localId) : undefined;

  // The check-in page is deliberately at the app's own origin: a QR code on a
  // screen is scanned by people who will not check what host it points at, so it
  // should not point somewhere they have never heard of.
  const checkInUrl = selected
    ? `${window.location.origin}/registers/checkin?s=${encodeURIComponent(selected.id)}`
    : "";

  useEffect(() => {
    if (!checkInUrl) { setQr(null); return; }
    let live = true;
    QRCode.toDataURL(checkInUrl, { width: 480, margin: 1 })
      .then((url) => { if (live) setQr(url); })
      .catch(() => { if (live) setQr(null); });
    return () => { live = false; };
  }, [checkInUrl]);

  const { data: status, isFetching, refetch } = useQuery({
    queryKey: ["register-session-status", selected?.id],
    queryFn: () => fetchSessionStatus(selected!.id),
    enabled: !!selected?.id,
    // A teaching day is watched while people are arriving, so this polls rather
    // than waiting to be told. Thirty seconds is often enough to feel live and
    // rare enough not to hammer a function on a cold isolate.
    refetchInterval: 30_000,
  });

  const publish = useMutation({
    mutationFn: () => {
      const day = blob.sessions.find((s) => s.id === localId);
      if (!day) throw new Error("Choose a teaching day first");
      return publishSession({
        registerId, title: day.title, sessionDate: date || firstOf(day.month), localId,
      });
    },
    onSuccess: ({ created }) => {
      toast.success(created ? "Published — the sign-in link is live." : "Updated.");
      queryClient.invalidateQueries({ queryKey: ["register-live-sessions", registerId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const mark = useMutation({
    mutationFn: (args: { name: string; localTraineeId: string; grade?: string; checkedIn: boolean }) =>
      markAttended({
        sessionId: selected!.id,
        checkedIn: args.checkedIn,
        trainees: [{
          name: args.name, local_trainee_id: args.localTraineeId, grade: args.grade ?? null,
        }],
      }),
    onSuccess: (result, args) => {
      if (args.checkedIn && result.no_email.length) {
        toast.success(`${args.name} marked present. No email on file, so no certificate can be sent.`);
      } else {
        toast.success(args.checkedIn ? `${args.name} marked present.` : `${args.name} unmarked.`);
      }
      refetch();
      queryClient.invalidateQueries({ queryKey: ["register-store"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Who is expected: everyone still on the programme, minus those already in.
  const expected = useMemo(() => {
    const here = new Set((status?.attendees ?? []).filter((a) => a.checked_in_at)
      .map((a) => a.name.toLowerCase().trim()));
    return blob.trainees
      .filter((t) => !isFormerTrainee(blob, t.id))
      .filter((t) => !here.has(t.name.toLowerCase().trim()))
      .filter((t) => !selected?.local_id || !isPresent(blob, t.id, selected.local_id))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [blob, status?.attendees, selected?.local_id]);

  if (!blob.sessions.length) {
    return (
      <p className="text-sm text-muted-foreground">
        Add a teaching day under <strong>Trainees &amp; days</strong> first — publishing one
        is what creates its sign-in link.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <p className="max-w-2xl text-sm text-muted-foreground">
        Publishing a teaching day gives it a sign-in link and a QR code. Trainees scan it,
        pick their name, and are marked present in the register straight away.
      </p>

      <Card>
        <CardContent className="grid gap-3 p-4 sm:grid-cols-[1fr,auto,auto] sm:items-end">
          <div className="space-y-1.5">
            <Label htmlFor="live-day" className="text-xs">Teaching day</Label>
            <Select
              value={localId}
              onValueChange={(v) => {
                setLocalId(v);
                const day = blob.sessions.find((s) => s.id === v);
                setDate(publishedFor(v)?.session_date ?? (day ? firstOf(day.month) : ""));
              }}
            >
              <SelectTrigger id="live-day"><SelectValue placeholder="Choose a day" /></SelectTrigger>
              <SelectContent>
                {days.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {formatMonth(s.month, "en-GB")} · {s.title}
                    {publishedFor(s.id) ? " — published" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="live-date" className="text-xs">Date</Label>
            <Input id="live-date" type="date" value={date}
              onChange={(e) => setDate(e.target.value)} className="w-full sm:w-[160px]" />
          </div>

          <Button
            onClick={() => publish.mutate()}
            disabled={!localId || publish.isPending}
            className="w-full sm:w-auto"
          >
            <Radio className="mr-1.5 h-4 w-4" />
            {publish.isPending ? "Publishing…" : selected ? "Update" : "Publish"}
          </Button>
        </CardContent>
      </Card>

      {isLoading && <Skeleton className="h-40 w-full" />}

      {selected && (
        <>
          <Card>
            <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-start">
              {qr && (
                <img
                  src={qr}
                  alt={`QR code for ${selected.title}`}
                  className="mx-auto h-44 w-44 shrink-0 rounded-lg border bg-white p-2"
                />
              )}

              <div className="min-w-0 flex-1 space-y-3">
                <div>
                  <p className="font-medium">{selected.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(selected.session_date).toLocaleDateString("en-GB", {
                      day: "numeric", month: "long", year: "numeric",
                    })}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline"
                    onClick={() => {
                      navigator.clipboard.writeText(checkInUrl)
                        .then(() => toast.success("Sign-in link copied."))
                        .catch(() => toast.error("Could not copy — select the link and copy it by hand."));
                    }}>
                    <Copy className="mr-1.5 h-3.5 w-3.5" /> Copy link
                  </Button>
                  <Button asChild size="sm" variant="outline">
                    <a href={checkInUrl} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="mr-1.5 h-3.5 w-3.5" /> Open sign-in page
                    </a>
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => refetch()} disabled={isFetching}>
                    <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
                    Refresh
                  </Button>
                </div>

                <p className="break-all rounded bg-muted px-2 py-1 text-[11px] text-muted-foreground">
                  {checkInUrl}
                </p>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-5 lg:grid-cols-2">
            <section className="space-y-2">
              <h3 className="text-sm font-semibold">
                Signed in{" "}
                <Badge variant="secondary" className="ml-1">
                  {status?.attendees.filter((a) => a.checked_in_at).length ?? 0}
                </Badge>
              </h3>

              {!status?.attendees.some((a) => a.checked_in_at) ? (
                <p className="text-sm text-muted-foreground">Nobody yet.</p>
              ) : (
                <div className="divide-y rounded-lg border">
                  {status.attendees.filter((a) => a.checked_in_at).map((a) => (
                    <div key={a.id} className="flex items-center gap-2 px-3 py-2">
                      <Check className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{a.name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {a.grade ? `${a.grade} · ` : ""}
                          {a.feedback_completed ? "feedback given" : "feedback outstanding"}
                        </p>
                      </div>
                      <Button size="icon" variant="ghost" className="h-7 w-7"
                        aria-label={`Unmark ${a.name}`}
                        onClick={() => mark.mutate({
                          name: a.name, localTraineeId: "", checkedIn: false,
                        })}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {status && status.feedback_count > 0 && (
                <p className="text-xs text-muted-foreground">
                  {status.feedback_count} feedback{" "}
                  {status.feedback_count === 1 ? "response" : "responses"} so far.
                </p>
              )}
            </section>

            <section className="space-y-2">
              <h3 className="text-sm font-semibold">
                Still expected <Badge variant="outline" className="ml-1">{expected.length}</Badge>
              </h3>
              <p className="text-xs text-muted-foreground">
                Anyone who cannot scan can be marked present here.
              </p>

              {expected.length === 0 ? (
                <p className="text-sm text-muted-foreground">Everybody is in.</p>
              ) : (
                <div className="max-h-[420px] divide-y overflow-y-auto rounded-lg border">
                  {expected.map((t) => (
                    <div key={t.id} className="flex items-center gap-2 px-3 py-1.5">
                      <span className="min-w-0 flex-1 truncate text-sm">{t.name}</span>
                      <Button size="sm" variant="outline" className="h-7 text-xs"
                        disabled={mark.isPending}
                        onClick={() => mark.mutate({
                          name: t.name, localTraineeId: t.id, grade: t.grade, checkedIn: true,
                        })}>
                        Mark present
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
