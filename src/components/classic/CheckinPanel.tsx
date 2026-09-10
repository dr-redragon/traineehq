import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { YearTabs } from "@/components/classic/YearTabs";
import { ChaseDialog } from "@/components/classic/ChaseDialog";
import { setAttendance, upsertSession } from "@/lib/classic/blob";
import { GRADES } from "@/lib/classic/constants";
import { isPresent } from "@/lib/classic/attendance";
import { unexplainedAbsentees } from "@/lib/classic/chase";
import {
  emailFeedbackLink, fetchSessionStatus, markAttended, publishSession,
} from "@/lib/classic/liveApi";
import { describeSync, mergeCheckIns, presentPayloads } from "@/lib/classic/liveSync";
import {
  ALL_YEARS, availableAcademicYears, defaultAcademicYear, formatMonth,
  sessionsInYear, sessionsSorted,
} from "@/lib/classic/months";
import type { ClassicStore } from "@/components/classic/types";
import type { RegisterDirectoryEntry, RegisterSession } from "@/lib/classic/types";

/**
 * Check-in / QR — the tab that is open on a laptop at the front of the room.
 *
 * The QR is the point: trainees scan it, pick their name, and are logged
 * without an account and without a queue at a clipboard. Everything else here
 * exists because that flow has edges — somebody's phone is flat (manual
 * check-in), somebody signed in on paper last month (two-way sync), somebody
 * simply did not come (the chaser).
 *
 * The register keeps its own copy of attendance in the blob, and the live
 * teaching day keeps a list of who scanned. Those are two records of the same
 * fact, so they are merged in BOTH directions: sign-ins come in, and anyone
 * ticked here goes out. Neither is treated as the winner.
 */
export function CheckinPanel({
  entry,
  store,
}: {
  entry: RegisterDirectoryEntry;
  store: ClassicStore;
}) {
  const { blob, edit } = store;
  const queryClient = useQueryClient();
  const years = useMemo(() => availableAcademicYears(blob.sessions), [blob.sessions]);
  const [year, setYear] = useState(() => defaultAcademicYear(blob.sessions));
  const [activeId, setActiveId] = useState<string>("");
  const [qr, setQr] = useState<string | null>(null);
  const [traineeId, setTraineeId] = useState("");
  const [grade, setGrade] = useState("");
  const [busy, setBusy] = useState(false);
  const [chasing, setChasing] = useState(false);

  const scoped = year === ALL_YEARS || !years.length
    ? sessionsSorted(blob.sessions)
    : sessionsInYear(blob.sessions, year);

  // The most recent teaching day in scope is nearly always the one being run.
  const active: RegisterSession | undefined =
    scoped.find((s) => s.id === activeId) ?? scoped[scoped.length - 1];

  const checkInUrl = active?.cloudId
    ? `${window.location.origin}/classic-registers/checkin?s=${encodeURIComponent(active.cloudId)}`
    : null;

  useEffect(() => {
    if (!checkInUrl) { setQr(null); return; }
    let alive = true;
    QRCode.toDataURL(checkInUrl, { width: 480, margin: 1 })
      .then((url) => { if (alive) setQr(url); })
      .catch(() => { if (alive) setQr(null); });
    return () => { alive = false; };
  }, [checkInUrl]);

  const status = useQuery({
    queryKey: ["classic-session-status", active?.cloudId],
    queryFn: () => fetchSessionStatus(active!.cloudId!),
    enabled: !!active?.cloudId,
    refetchInterval: 20_000,
  });

  const present = active
    ? blob.trainees.filter((t) => isPresent(blob, t.id, active.id))
    : [];

  const absentees = unexplainedAbsentees(blob, active);

  /** Publish the teaching day so it has a link and a QR code at all. */
  const publish = async () => {
    if (!active) return;
    setBusy(true);
    try {
      const { session } = await publishSession({
        registerId: entry.id,
        title: active.title,
        // The register keeps months, the live day needs a date. The first of
        // the month is a placeholder the organiser never sees; the day is
        // identified by its title.
        sessionDate: `${active.month}-01`,
        localId: active.id,
      });
      edit((b) => upsertSession(b, { ...active, cloudId: session.id }));
      toast.success("Teaching day published — the QR code is live");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  /** Merge the live sign-in list and the register's grid, both ways. */
  const sync = async () => {
    if (!active?.cloudId) return;
    setBusy(true);
    try {
      const fresh = await fetchSessionStatus(active.cloudId);
      const merged = mergeCheckIns(blob, active.id, fresh.attendees);
      const outgoing = presentPayloads(blob, active.id).filter((payload) =>
        !fresh.attendees.some((a) =>
          a.name.trim().toLowerCase() === payload.name.trim().toLowerCase()));

      if (outgoing.length) {
        await markAttended({ sessionId: active.cloudId, trainees: outgoing });
      }
      if (merged.added || merged.regraded || merged.emailed) {
        edit(() => merged.blob);
      }
      await queryClient.invalidateQueries({ queryKey: ["classic-session-status"] });
      toast.success(describeSync(merged, outgoing.length) || "Already in step");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const manualCheckIn = () => {
    if (!active || !traineeId) return;
    edit((b) => setAttendance(b, traineeId, active.id, true, grade || undefined));
    setTraineeId("");
    setGrade("");
  };

  const sendFeedbackLinks = async () => {
    if (!active?.cloudId) return;
    setBusy(true);
    try {
      const outcome = await emailFeedbackLink({ sessionId: active.cloudId });
      toast.success(
        `Feedback link sent to ${outcome.sent} of ${outcome.considered}.` +
        (outcome.failures.length ? ` ${outcome.failures.length} could not be sent.` : ""));
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <h2 className="panel-title">Session check-in</h2>
      <p className="panel-lede">
        Display the QR at the teaching day — trainees scan, pick their name, and
        they're logged instantly. Or check people in manually below.
      </p>

      <YearTabs years={years} sessions={blob.sessions} value={year} onChange={setYear} />

      <div className="qr-layout">
        <div className="qr-box card pad">
          <div id="qrcode">
            {qr ? (
              <img src={qr} alt={`QR code for ${active?.title ?? "the teaching day"}`} width={220} height={220} />
            ) : (
              <div className="empty" style={{ padding: 24 }}>
                {active ? "Not published yet" : "No teaching day selected"}
              </div>
            )}
          </div>
          <p className="helper" style={{ marginTop: 12 }}>
            Scan to open the sign-in form for<br />
            <strong>{active ? `${active.title} — ${formatMonth(active.month)}` : "—"}</strong>
          </p>
          {checkInUrl ? (
            <button
              type="button"
              className="btn ghost sm"
              style={{ marginTop: 10 }}
              onClick={() => {
                navigator.clipboard.writeText(checkInUrl);
                toast.success("Link copied");
              }}
            >
              Copy form link
            </button>
          ) : (
            <button
              type="button"
              className="btn primary sm"
              style={{ marginTop: 10 }}
              disabled={!active || busy}
              onClick={publish}
            >
              {busy ? "Publishing…" : "Publish this day"}
            </button>
          )}
        </div>

        <div>
          <div className="field">
            <label className="fld">Active session</label>
            <div className="session-picker">
              {scoped.length === 0 ? (
                <div className="empty">
                  No teaching days in this year yet — add one under “Trainees &amp; sessions”.
                </div>
              ) : (
                [...scoped].reverse().map((session) => (
                  <label
                    key={session.id}
                    className={"sess-radio" + (session.id === active?.id ? " sel" : "")}
                  >
                    <input
                      type="radio"
                      name="classic-active-session"
                      checked={session.id === active?.id}
                      onChange={() => setActiveId(session.id)}
                    />
                    <span>
                      <strong>{session.title}</strong>
                      <span className="li-sub"> · {formatMonth(session.month)}</span>
                      {session.cloudId && <span className="badge active" style={{ marginLeft: 8 }}>Live</span>}
                    </span>
                  </label>
                ))
              )}
            </div>
          </div>

          <div className="card pad" style={{ marginTop: 18 }}>
            <label className="fld">Quick manual check-in</label>
            <div className="inline-form" style={{ gridTemplateColumns: "1.4fr .8fr auto" }}>
              <div>
                <select value={traineeId} onChange={(e) => setTraineeId(e.target.value)}>
                  <option value="">Trainee…</option>
                  {[...blob.trainees].sort((a, b) => a.name.localeCompare(b.name)).map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <select value={grade} onChange={(e) => setGrade(e.target.value)}>
                  <option value="">Grade…</option>
                  {GRADES.map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
              <div>
                <button
                  type="button"
                  className="btn primary"
                  style={{ width: "100%" }}
                  disabled={!active || !traineeId}
                  onClick={manualCheckIn}
                >
                  Mark present
                </button>
              </div>
            </div>
            <p className="helper">
              Logs the trainee as present for the active session, recording the
              grade they're at this rotation.
            </p>

            <div style={{ marginTop: 14 }}>
              {present.length === 0 ? (
                <p className="helper">Nobody marked present yet.</p>
              ) : (
                <>
                  <div className="att-head">
                    <strong style={{ fontSize: 13 }}>
                      {present.length} present
                    </strong>
                  </div>
                  <div className="att-list">
                    {present.map((t) => (
                      <div className="att-row" key={t.id}>
                        <span />
                        <span className="who">{t.name}</span>
                        <span className="att-tags">
                          <button
                            type="button"
                            className="btn ghost sm"
                            onClick={() => edit((b) => setAttendance(b, t.id, active!.id, false))}
                          >
                            Undo
                          </button>
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="card pad" style={{ marginTop: 18 }}>
            <label className="fld">Live sign-in, feedback &amp; certificates</label>
            {!active?.cloudId ? (
              <p className="helper">
                Publish this teaching day to give it a QR code, collect feedback
                and issue certificates.
              </p>
            ) : status.isLoading ? (
              <p className="helper">Reading the live list…</p>
            ) : status.error ? (
              <div className="notice bad">{(status.error as Error).message}</div>
            ) : (
              <>
                <div className="stat-strip" style={{ marginBottom: 14 }}>
                  <div className="stat">
                    <div className="n">{status.data?.attendees.length ?? 0}</div>
                    <div className="l">Signed in</div>
                  </div>
                  <div className="stat">
                    <div className="n">{status.data?.feedback_count ?? 0}</div>
                    <div className="l">Feedback given</div>
                  </div>
                  <div className="stat">
                    <div className="n">
                      {status.data?.attendees.filter((a) => a.certificate_sent_at).length ?? 0}
                    </div>
                    <div className="l">Certificates sent</div>
                  </div>
                </div>

                {status.data && !status.data.email_configured && (
                  <div className="notice warn">
                    No mail sender is configured, so feedback links and
                    certificates cannot go out yet.
                  </div>
                )}

                <div className="row-actions">
                  <button type="button" className="btn ghost sm" disabled={busy} onClick={sync}>
                    {busy ? "Working…" : "Sync sign-ins"}
                  </button>
                  <button
                    type="button"
                    className="btn ghost sm"
                    disabled={busy || !status.data?.email_configured}
                    onClick={sendFeedbackLinks}
                  >
                    Email the feedback link
                  </button>
                </div>
                <p className="helper">
                  Syncing works both ways: sign-ins from the QR come into the
                  register, and anyone ticked here is added to the live list.
                </p>
              </>
            )}
          </div>

          <div className="card pad" style={{ marginTop: 18 }}>
            <label className="fld">Unexplained absences</label>
            {!active ? (
              <p className="helper">Pick a teaching day above.</p>
            ) : absentees.length === 0 ? (
              <p className="helper">
                Nobody is unaccounted for — everyone eligible either attended or
                has an excusal recorded.
              </p>
            ) : (
              <>
                <p className="helper" style={{ marginTop: 0 }}>
                  {absentees.length} eligible trainee{absentees.length === 1 ? "" : "s"} with
                  neither an attendance nor an excusal for this day.
                </p>
                <div className="chase-to" style={{ marginTop: 8 }}>
                  {absentees.map((t) => <span className="who" key={t.id}>{t.name}</span>)}
                </div>
                <button
                  type="button"
                  className="btn clay sm"
                  style={{ marginTop: 12 }}
                  disabled={!active.cloudId}
                  title={active.cloudId ? undefined : "Publish the teaching day first"}
                  onClick={() => setChasing(true)}
                >
                  Ask about the absence
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {chasing && active && (
        <ChaseDialog
          session={active}
          registerName={entry.name}
          absentees={absentees}
          onClose={() => setChasing(false)}
        />
      )}
    </>
  );
}
