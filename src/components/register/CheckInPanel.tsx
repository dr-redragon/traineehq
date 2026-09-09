import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import QRCode from "qrcode";
import { Copy, MailWarning, QrCode, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ChaseAbsencesDialog } from "@/components/register/ChaseAbsencesDialog";
import { FeedbackFormEditor } from "@/components/register/FeedbackFormEditor";
import { LiveDayCard } from "@/components/register/LiveDayCard";
import { YearTabs } from "@/components/register/YearTabs";
import { useLiveAttendanceSync } from "@/hooks/useLiveAttendanceSync";
import { fetchSessionStatus } from "@/lib/register/liveApi";
import { gradeAt, isPresent, refreshGrades } from "@/lib/register/attendance";
import { setAttendance } from "@/lib/register/blob";
import { splitByEmail, unexplainedAbsentees } from "@/lib/register/chase";
import { GRADES } from "@/lib/register/constants";
import {
  ALL_YEARS, academicYearOf, availableAcademicYears, defaultAcademicYear, formatMonth,
  sessionsInYear, sessionsSorted,
} from "@/lib/register/months";
import { useRegister } from "@/contexts/RegisterContext";
import type { RegisterEdit } from "@/hooks/useRegisterStore";
import type { RegisterBlob } from "@/lib/register/types";
import { cn } from "@/lib/utils";

/**
 * Session check-in: the tab an organiser has open while a teaching day runs.
 *
 * Modelled on the standalone register's Check-in / QR panel, which put the QR
 * code, the manual fallback and everything that happens afterwards on one
 * screen. That layout is not decoration — the person using it is standing at
 * the front of a lecture theatre with thirty people arriving, and going
 * looking for the manual check-in in another tab is not something they have
 * time to do.
 *
 * The register and the live sign-in list are kept saying the same thing from
 * both directions: a QR sign-in writes the grid through
 * `register_record_checkin()`, and every mark made here — or in the attendance
 * grid — is pushed to the live list through `mark-attended`.
 */
export function CheckInPanel({
  blob, registerId, registerSlug, onEdit,
}: {
  blob: RegisterBlob;
  registerId: string;
  registerSlug: string;
  onEdit: (edit: RegisterEdit) => void;
}) {
  const { activeRegister } = useRegister();
  const { publishedFor, pushMark, pushAllPresent } = useLiveAttendanceSync(registerId, blob);

  const [manualTrainee, setManualTrainee] = useState("");
  const [manualGrade, setManualGrade] = useState("");
  const [chasing, setChasing] = useState(false);
  const [editingForm, setEditingForm] = useState(false);

  const years = useMemo(() => availableAcademicYears(blob.sessions), [blob.sessions]);
  const [year, setYear] = useState<string | null>(null);
  const activeYear = year ?? defaultAcademicYear(blob.sessions);

  const scoped = useMemo(
    () => (activeYear === ALL_YEARS
      ? sessionsSorted(blob.sessions)
      : sessionsInYear(blob.sessions, activeYear)),
    [blob.sessions, activeYear],
  );

  const [activeId, setActiveId] = useState<string | null>(null);
  // The newest day in the chosen year, which is nearly always the one being
  // run. Reset when the year changes so the new scope picks its own.
  const active = scoped.find((s) => s.id === activeId) ?? scoped[scoped.length - 1];

  /** Changing day closes anything that was open about the last one. */
  const chooseDay = (id: string | null) => {
    setActiveId(id);
    setChasing(false);
    setEditingForm(false);
    setManualTrainee("");
    setManualGrade("");
  };

  useEffect(() => {
    setActiveId((current) => (scoped.some((s) => s.id === current) ? current : null));
  }, [scoped]);

  const live = active ? publishedFor(active.id) : undefined;

  const [qr, setQr] = useState<string | null>(null);
  const checkInUrl = live
    ? `${window.location.origin}/registers/checkin?s=${encodeURIComponent(live.id)}`
    : "";

  useEffect(() => {
    if (!checkInUrl) { setQr(null); return; }
    let alive = true;
    QRCode.toDataURL(checkInUrl, { width: 480, margin: 1 })
      .then((url) => { if (alive) setQr(url); })
      .catch(() => { if (alive) setQr(null); });
    return () => { alive = false; };
  }, [checkInUrl]);

  // Read for the sandbox warning on the chaser; the request itself is shared
  // with LiveDayCard through the query cache, so this costs nothing extra.
  const { data: status } = useQuery({
    queryKey: ["register-session-status", live?.id],
    queryFn: () => fetchSessionStatus(live!.id),
    enabled: !!live?.id,
  });

  // ------------------------------------------------------ manual check-in --

  const present = useMemo(
    () => (active ? blob.trainees.filter((t) => isPresent(blob, t.id, active.id)) : []),
    [blob, active],
  );

  /**
   * Everyone, not only the people not yet marked.
   *
   * Re-marking somebody already present is how their grade gets corrected —
   * they signed in as ST5 and are actually ST6 — so hiding them would remove
   * the only way to fix it from the tab where it is noticed.
   */
  const pickable = useMemo(
    () => [...blob.trainees].sort((a, b) => a.name.localeCompare(b.name)),
    [blob.trainees],
  );

  const markPresent = () => {
    if (!active || !manualTrainee) {
      toast.error("Pick a teaching day and a trainee.");
      return;
    }
    const trainee = blob.trainees.find((t) => t.id === manualTrainee);
    // Marking present with a grade is a sign-in, so it re-dates the grade held
    // on the roster exactly as the trainee's own sign-in would.
    onEdit((b) =>
      refreshGrades(setAttendance(b, manualTrainee, active.id, true, manualGrade || undefined)).blob);
    void pushMark(manualTrainee, active.id, true, manualGrade || undefined);
    toast.success(
      `${trainee?.name ?? "Trainee"} marked present${manualGrade ? ` as ${manualGrade}` : ""}.`,
    );
    setManualTrainee("");
    setManualGrade("");
  };

  // ------------------------------------------------------------ absentees --

  const absent = useMemo(() => unexplainedAbsentees(blob, active), [blob, active]);
  const { withEmail, withoutEmail } = useMemo(() => splitByEmail(absent), [absent]);

  if (!blob.sessions.length) {
    return (
      <p className="text-sm text-muted-foreground">
        Add a teaching day under <strong>Trainees &amp; days</strong> first — publishing one is
        what creates its sign-in link.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <p className="max-w-2xl text-sm text-muted-foreground">
        Display the QR at the teaching day — trainees scan, pick their name, and they are logged
        instantly. Or check people in by hand below. Either way the attendance grid and the live
        sign-in list stay in step.
      </p>

      <YearTabs years={years} value={activeYear} onChange={(y) => { setYear(y); chooseDay(null); }} />

      <div className="grid gap-4 lg:grid-cols-[300px,1fr] lg:items-start">
        {/* --------------------------------------------------------- the QR */}
        <Card className="lg:sticky lg:top-16">
          <CardContent className="space-y-3 p-4 text-center">
            {qr ? (
              <img
                src={qr}
                alt={`QR code for ${live?.title ?? "the teaching day"}`}
                className="mx-auto h-52 w-52 rounded-lg border bg-white p-2"
              />
            ) : (
              <div className="mx-auto flex h-52 w-52 flex-col items-center justify-center gap-2 rounded-lg border border-dashed text-muted-foreground">
                <QrCode className="h-8 w-8 opacity-40" />
                <p className="px-4 text-[11px]">
                  {active
                    ? "Publish this teaching day to get its QR code."
                    : "Choose a teaching day."}
                </p>
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              Scan to open the sign-in form for<br />
              <strong className="text-foreground">
                {active
                  ? `${formatMonth(active.month, "en-GB")} · ${active.title}`
                  : "—"}
              </strong>
              {live && <Badge className="ml-1.5 bg-success text-success-foreground">live</Badge>}
            </p>

            {live && (
              <Button
                size="sm" variant="outline"
                onClick={() => navigator.clipboard.writeText(checkInUrl)
                  .then(() => toast.success("Sign-in link copied."))
                  .catch(() => toast.error("Could not copy — select the link and copy it by hand."))}
              >
                <Copy className="mr-1.5 h-3.5 w-3.5" /> Copy form link
              </Button>
            )}
            {live && (
              <p className="break-all rounded bg-muted px-2 py-1 text-[10px] text-muted-foreground">
                {checkInUrl}
              </p>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          {/* ------------------------------------------- the session picker */}
          <div className="space-y-1.5">
            <Label className="text-xs">Active teaching day</Label>
            <div className="max-h-[240px] space-y-1 overflow-y-auto rounded-lg border bg-card p-1.5">
              {scoped.length === 0 ? (
                <p className="px-2 py-4 text-center text-sm text-muted-foreground">
                  No teaching days in this academic year yet.
                </p>
              ) : (
                [...scoped].reverse().map((s, i, all) => {
                  const published = publishedFor(s.id);
                  const showYear = activeYear === ALL_YEARS
                    && (i === 0 || academicYearOf(all[i - 1].month) !== academicYearOf(s.month));
                  return (
                    <div key={s.id}>
                      {showYear && (
                        <p className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          {academicYearOf(s.month)}
                        </p>
                      )}
                      <button
                        type="button"
                        onClick={() => chooseDay(s.id)}
                        aria-pressed={active?.id === s.id}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors",
                          active?.id === s.id
                            ? "bg-primary text-primary-foreground"
                            : "hover:bg-muted",
                        )}
                      >
                        <span className="min-w-0 flex-1 truncate">
                          <strong>{formatMonth(s.month, "en-GB")}</strong> · {s.title}
                        </span>
                        {published && (
                          <Badge
                            variant={active?.id === s.id ? "secondary" : "outline"}
                            className="shrink-0 text-[10px]"
                          >
                            live
                          </Badge>
                        )}
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* --------------------------------------- quick manual check-in */}
          {active && (
            <Card>
              <CardContent className="space-y-3 p-4">
                <Label className="text-xs">Quick manual check-in</Label>
                <div className="grid gap-2 sm:grid-cols-[1.4fr,0.8fr,auto]">
                  <Select value={manualTrainee} onValueChange={setManualTrainee}>
                    <SelectTrigger><SelectValue placeholder="Trainee…" /></SelectTrigger>
                    <SelectContent>
                      {pickable.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.name}
                          {active && isPresent(blob, t.id, active.id) ? " — already in" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={manualGrade} onValueChange={setManualGrade}>
                    <SelectTrigger><SelectValue placeholder="Grade…" /></SelectTrigger>
                    <SelectContent>
                      {GRADES.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Button onClick={markPresent} disabled={!manualTrainee}>
                    <UserPlus className="mr-1.5 h-4 w-4" /> Mark present
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Logs the trainee as present for this teaching day, recording the grade they are
                  at this rotation. Published days get the same mark on the live list, so the
                  feedback form and certificate reach them too.
                </p>

                {present.length ? (
                  <div className="space-y-1.5">
                    <p className="text-[11px] text-muted-foreground">{present.length} signed in</p>
                    <div className="flex flex-wrap gap-1.5">
                      {present.map((t) => {
                        const g = gradeAt(blob, t.id, active.id);
                        return (
                          <Badge key={t.id} variant="secondary" className="text-[11px]">
                            {t.name}{g ? ` · ${g}` : ""}
                          </Badge>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <p className="text-[11px] text-muted-foreground">
                    No check-ins yet for this teaching day.
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {/* ------------------------------------------------- the live day */}
          {active && (
            <LiveDayCard
              key={active.id}
              blob={blob}
              registerId={registerId}
              registerSlug={registerSlug}
              session={active}
              live={live}
              onEdit={onEdit}
              pushAllPresent={pushAllPresent}
              onEditForm={() => setEditingForm(true)}
            />
          )}

          {/* ------------------------------------------ unexplained absence */}
          {active && (
            <Card>
              <CardContent className="space-y-3 p-4">
                <Label className="flex items-center gap-1.5 text-xs">
                  <MailWarning className="h-3.5 w-3.5" /> Unexplained absences
                </Label>

                {!absent.length ? (
                  <p className="text-sm text-muted-foreground">
                    Everyone eligible for <strong>{active.title}</strong> is either marked present
                    or excused — nobody to chase.
                  </p>
                ) : (
                  <>
                    <p className="text-sm text-muted-foreground">
                      <strong>{absent.length}</strong> eligible{" "}
                      {absent.length === 1 ? "trainee is" : "trainees are"} down as absent for{" "}
                      <strong>{active.title}</strong> with no excuse recorded
                      {withoutEmail.length > 0 && (
                        <>, and <strong>{withoutEmail.length}</strong> of them{" "}
                          {withoutEmail.length === 1 ? "has" : "have"} no email on file</>
                      )}.
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {absent.map((t) => (
                        <Badge
                          key={t.id}
                          variant={(t.email ?? "").trim() ? "secondary" : "outline"}
                          className="text-[11px]"
                        >
                          {t.name}{(t.email ?? "").trim() ? "" : " · no email"}
                        </Badge>
                      ))}
                    </div>
                    <Button
                      size="sm"
                      onClick={() => setChasing(true)}
                      disabled={!withEmail.length || !live}
                      title={!live
                        ? "Publish this teaching day first — the chaser is sent through it"
                        : undefined}
                    >
                      Write the chaser email…
                    </Button>
                    {!withEmail.length && (
                      <p className="text-[11px] text-muted-foreground">
                        None of them have an email on file yet — add one under Trainees &amp; days.
                      </p>
                    )}
                    {!live && !!withEmail.length && (
                      <p className="text-[11px] text-muted-foreground">
                        Publish this teaching day first — the chaser is sent through it.
                      </p>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {active && live && (
        <ChaseAbsencesDialog
          open={chasing}
          onOpenChange={setChasing}
          blob={blob}
          session={active}
          liveSessionId={live.id}
          registerId={registerId}
          registerName={activeRegister?.name}
          sandboxFrom={status?.email_sandbox ? status.email_from : null}
        />
      )}

      <Dialog open={editingForm} onOpenChange={setEditingForm}>
        <DialogContent className="max-h-[92vh] max-w-6xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Feedback form</DialogTitle>
          </DialogHeader>
          <FeedbackFormEditor
            registerId={registerId}
            sessionId={live?.id ?? null}
            sessionTitle={active ? `${formatMonth(active.month, "en-GB")} · ${active.title}` : undefined}
            onClose={() => setEditingForm(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
