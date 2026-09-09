import { useState } from "react";
import { toast } from "sonner";
import { MonthInput } from "@/components/classic/MonthInput";
import {
  newId, removeSession, removeTrainee, upsertSession, upsertTrainee,
} from "@/lib/classic/blob";
import { GRADES } from "@/lib/classic/constants";
import { isFormerTrainee } from "@/lib/classic/eligibility";
import { formatMonth, sessionsSorted } from "@/lib/classic/months";
import { latestGrade } from "@/lib/classic/attendance";
import type { ClassicStore } from "@/components/classic/types";
import type { RegisterTrainee } from "@/lib/classic/types";

/**
 * Trainees & sessions — the two lists everything else is built from.
 *
 * Current and former trainees are separated because a register accumulates
 * people who have CCT'd or transferred out, and after a few years they crowd out
 * the cohort actually being taught. Former trainees are folded away rather than
 * deleted: their attendance is still part of the years they were here, and
 * deleting them would silently rewrite those years' figures.
 */
export function ManagePanel({ store }: { store: ClassicStore }) {
  const { blob, edit } = store;

  const [name, setName] = useState("");
  const [grade, setGrade] = useState("");
  const [email, setEmail] = useState("");
  const [month, setMonth] = useState("");
  const [title, setTitle] = useState("");
  const [showFormer, setShowFormer] = useState(false);
  const [editing, setEditing] = useState<RegisterTrainee | null>(null);

  const sorted = [...blob.trainees].sort((a, b) => a.name.localeCompare(b.name));
  const current = sorted.filter((t) => !isFormerTrainee(blob, t.id));
  const former = sorted.filter((t) => isFormerTrainee(blob, t.id));
  const sessions = sessionsSorted(blob.sessions);

  const addTrainee = () => {
    if (!name.trim()) return;
    edit((b) => upsertTrainee(b, {
      id: newId(),
      name: name.trim(),
      grade: grade || undefined,
      email: email.trim() || undefined,
    }));
    setName(""); setGrade(""); setEmail("");
  };

  const addSession = () => {
    if (!month || !title.trim()) return;
    edit((b) => upsertSession(b, { id: newId(), month, title: title.trim() }));
    setMonth(""); setTitle("");
  };

  const backup = () => {
    const data = new Blob([JSON.stringify(blob, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(data);
    const a = document.createElement("a");
    a.href = url;
    a.download = `register-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Backup downloaded");
  };

  const traineeRow = (trainee: RegisterTrainee) => (
    <div className="list-item" key={trainee.id}>
      <div>
        <div className="li-main">
          {trainee.name}
          <span className="grade-tag">{latestGrade(blob, trainee.id)}</span>
        </div>
        <div className="li-sub">{trainee.email || "No email — cannot be sent a certificate"}</div>
      </div>
      <div className="row-actions">
        <button type="button" className="btn ghost sm" onClick={() => setEditing(trainee)}>Edit</button>
        <button
          type="button"
          className="btn ghost sm"
          onClick={() => {
            if (!window.confirm(
              `Remove ${trainee.name} from the register? Their attendance history goes too, ` +
              `which will change the figures for every year they were here.`)) return;
            edit((b) => removeTrainee(b, trainee.id));
          }}
        >
          Remove
        </button>
      </div>
    </div>
  );

  return (
    <>
      <h2 className="panel-title">Trainees &amp; sessions</h2>
      <p className="panel-lede">
        The roster of trainees and the calendar of monthly teaching days.
        Everything above is built from these two lists.
      </p>

      <div className="grid2" style={{ alignItems: "start" }}>
        <div className="card pad">
          <label className="fld">Add trainee</label>
          <div className="inline-form" style={{ gridTemplateColumns: "1.2fr .7fr 1.2fr auto" }}>
            <div>
              <input placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <select value={grade} onChange={(e) => setGrade(e.target.value)}>
                <option value="">Grade…</option>
                {GRADES.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <div>
              <input
                type="email"
                placeholder="Email (optional)"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <button type="button" className="btn primary" onClick={addTrainee}>Add</button>
            </div>
          </div>
          <p className="helper">
            Grade keeps itself up to date: whatever a trainee picks at their next
            sign-in replaces what is held here, since it changes between
            rotations. Set it by hand for anyone who has not signed in yet, or use{" "}
            <strong>Edit</strong> on their row. Email is used to send
            certificates — trainees without one are asked to add it when they
            next sign in.
          </p>

          <div style={{ marginTop: 8, maxHeight: 380, overflow: "auto" }}>
            {current.length === 0
              ? <div className="empty">No trainees yet.</div>
              : current.map(traineeRow)}
          </div>

          {former.length > 0 && (
            <>
              <button
                type="button"
                className={"former-toggle" + (showFormer ? " open" : "")}
                onClick={() => setShowFormer((s) => !s)}
              >
                <span>Former trainees ({former.length})</span>
                <span className="chev">▾</span>
              </button>
              <div
                className={"former-list" + (showFormer ? " open" : "")}
                style={{ maxHeight: 380, overflow: "auto" }}
              >
                {former.map(traineeRow)}
              </div>
            </>
          )}
        </div>

        <div className="card pad">
          <label className="fld">Add teaching session</label>
          <div className="inline-form" style={{ gridTemplateColumns: ".9fr 1.4fr auto" }}>
            <div><MonthInput value={month} onChange={setMonth} /></div>
            <div>
              <input
                placeholder="Title e.g. Paediatric ENT WYT"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div><button type="button" className="btn primary" onClick={addSession}>Add</button></div>
          </div>

          <div style={{ marginTop: 8, maxHeight: 380, overflow: "auto" }}>
            {sessions.length === 0 ? (
              <div className="empty">No teaching days yet.</div>
            ) : (
              sessions.map((session) => (
                <div className="list-item" key={session.id}>
                  <div>
                    <div className="li-main">{session.title}</div>
                    <div className="li-sub">
                      {formatMonth(session.month)}
                      {session.cloudId ? " · published for check-in" : ""}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn ghost sm"
                    onClick={() => {
                      if (!window.confirm(
                        `Delete “${session.title}”? Every attendance mark and excusal ` +
                        `recorded against it goes too.`)) return;
                      edit((b) => removeSession(b, session.id));
                    }}
                  >
                    Delete
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="danger-zone">
        <div className="row-actions" style={{ justifyContent: "space-between" }}>
          <div>
            <strong>Data</strong>
            <p className="helper" style={{ marginTop: 2 }}>
              This register lives in TraineeHQ's database, not in this browser, so
              it is already backed up and already shared with the other organisers.
              The original's “restore” and “load sample cohort” buttons are
              deliberately not here: they overwrote one browser's copy, and
              against a shared register they would overwrite everybody's.
            </p>
          </div>
          <div className="row-actions">
            <button type="button" className="btn ghost sm" onClick={backup}>Download backup</button>
          </div>
        </div>
      </div>

      {editing && (
        <EditTraineeDialog
          trainee={editing}
          onClose={() => setEditing(null)}
          onSave={(updated) => { edit((b) => upsertTrainee(b, updated)); setEditing(null); }}
        />
      )}
    </>
  );
}

function EditTraineeDialog({
  trainee,
  onClose,
  onSave,
}: {
  trainee: RegisterTrainee;
  onClose: () => void;
  onSave: (trainee: RegisterTrainee) => void;
}) {
  const [name, setName] = useState(trainee.name);
  const [grade, setGrade] = useState(trainee.grade ?? "");
  const [email, setEmail] = useState(trainee.email ?? "");

  return (
    <div
      className="modal-back show classic-register"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="modal-card" role="dialog" aria-label="Edit trainee">
        <div className="modal-head"><h3>Edit trainee</h3></div>
        <div className="modal-body">
          <div className="field">
            <label className="fld">Full name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="field">
            <label className="fld">Grade</label>
            <select value={grade} onChange={(e) => setGrade(e.target.value)}>
              <option value="">Grade…</option>
              {GRADES.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label className="fld">Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
        </div>
        <div style={{
          padding: "14px 26px", borderTop: "1px solid var(--line)",
          display: "flex", gap: 10, justifyContent: "flex-end",
        }}>
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button
            type="button"
            className="btn primary"
            disabled={!name.trim()}
            onClick={() => onSave({
              ...trainee,
              name: name.trim(),
              grade: grade || undefined,
              email: email.trim() || undefined,
            })}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
