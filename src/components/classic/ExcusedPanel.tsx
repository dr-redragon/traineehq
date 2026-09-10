import { useMemo, useState } from "react";
import { YearTabs } from "@/components/classic/YearTabs";
import { addExcusal, removeExcusal } from "@/lib/classic/blob";
import { EXCUSAL_REASONS, OTHER_REASON } from "@/lib/classic/constants";
import {
  ALL_YEARS, availableAcademicYears, defaultAcademicYear, formatMonth,
  sessionsInYear, sessionsSorted,
} from "@/lib/classic/months";
import type { ClassicStore } from "@/components/classic/types";

/**
 * Excused absences — the tab that makes the adjusted figure fair.
 *
 * A declared absence is removed from the DENOMINATOR, not counted as an
 * attendance: a trainee on annual leave is neither present nor penalised. The
 * reasons are a fixed list rather than free text because they are counted across
 * a cohort, and "on call" / "On-Call" / "oncall" would otherwise be three
 * different reasons.
 */
export function ExcusedPanel({ store }: { store: ClassicStore }) {
  const { blob, edit } = store;
  const years = useMemo(() => availableAcademicYears(blob.sessions), [blob.sessions]);
  const [year, setYear] = useState(() => defaultAcademicYear(blob.sessions));
  const [traineeId, setTraineeId] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [reason, setReason] = useState<string>(EXCUSAL_REASONS[0]);
  const [otherReason, setOtherReason] = useState("");

  const sessions = year === ALL_YEARS || !years.length
    ? sessionsSorted(blob.sessions)
    : sessionsInYear(blob.sessions, year);

  const trainees = [...blob.trainees].sort((a, b) => a.name.localeCompare(b.name));

  const inScope = new Set(sessions.map((s) => s.id));
  const listed = blob.excused
    .filter((e) => inScope.has(e.session))
    .sort((a, b) => (b.ts || "").localeCompare(a.ts || ""));

  const add = () => {
    const text = reason === OTHER_REASON ? otherReason.trim() : reason;
    if (!traineeId || !sessionId || !text) return;
    edit((b) => addExcusal(b, traineeId, sessionId, text));
    setTraineeId("");
    setSessionId("");
    setReason(EXCUSAL_REASONS[0]);
    setOtherReason("");
  };

  const nameOf = (id: string) => blob.trainees.find((t) => t.id === id)?.name ?? "Unknown trainee";
  const sessionOf = (id: string) => blob.sessions.find((s) => s.id === id);

  return (
    <>
      <h2 className="panel-title">Excused absences</h2>
      <p className="panel-lede">
        Declared absences (leave, on-call, sickness, study leave) are removed from
        the denominator, so a missed-but-excused session doesn't count against the
        trainee's adjusted attendance.
      </p>

      <YearTabs years={years} sessions={blob.sessions} value={year} onChange={setYear} />

      <div className="card pad" style={{ marginBottom: 20 }}>
        <div className="inline-form">
          <div>
            <label className="fld">Trainee</label>
            <select value={traineeId} onChange={(e) => setTraineeId(e.target.value)}>
              <option value="">Trainee…</option>
              {trainees.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div>
            <label className="fld">Session</label>
            <select value={sessionId} onChange={(e) => setSessionId(e.target.value)}>
              <option value="">Session…</option>
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>{formatMonth(s.month)} — {s.title}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="fld">Reason</label>
            <select value={reason} onChange={(e) => setReason(e.target.value)}>
              {EXCUSAL_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <button
              type="button"
              className="btn clay"
              style={{ width: "100%" }}
              disabled={store.isSaving}
              onClick={add}
            >
              Add excuse
            </button>
          </div>
        </div>
        {reason === OTHER_REASON && (
          <div className="field" style={{ marginTop: 12, marginBottom: 0 }}>
            <label className="fld">Specify reason</label>
            <input
              placeholder="Type the reason…"
              value={otherReason}
              onChange={(e) => setOtherReason(e.target.value)}
            />
          </div>
        )}
      </div>

      <div className="card">
        {listed.length === 0 ? (
          <div className="empty">No excused absences recorded for this period.</div>
        ) : (
          listed.map((excusal) => {
            const session = sessionOf(excusal.session);
            return (
              <div className="list-item" key={excusal.id}>
                <div>
                  <div className="li-main">{nameOf(excusal.trainee)}</div>
                  <div className="li-sub">
                    {session ? `${formatMonth(session.month)} — ${session.title}` : "Session removed"}
                    {" · "}{excusal.reason}
                  </div>
                </div>
                <button
                  type="button"
                  className="btn ghost sm"
                  onClick={() => edit((b) => removeExcusal(b, excusal.id))}
                >
                  Remove
                </button>
              </div>
            );
          })
        )}
      </div>
    </>
  );
}
