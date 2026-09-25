import { useState } from "react";
import { toast } from "sonner";
import { Modal } from "@/components/classic/Modal";
import {
  newId, removeSession, removeTrainee, upsertSession, upsertTrainee,
} from "@/lib/classic/blob";
import { GRADES } from "@/lib/classic/constants";
import { isFormerTrainee } from "@/lib/classic/eligibility";
import { formatMonth, sessionsSorted, sessionWhen } from "@/lib/classic/months";
import { latestGrade } from "@/lib/classic/attendance";
import type { ClassicStore } from "@/components/classic/types";
import type { RegisterDirectoryEntry, RegisterSession, RegisterTrainee } from "@/lib/classic/types";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Trainees & sessions — the two lists everything else is built from.
 *
 * Current and former trainees are separated because a register accumulates
 * people who have CCT'd or transferred out, and after a few years they crowd out
 * the cohort actually being taught. Former trainees are folded away rather than
 * deleted: their attendance is still part of the years they were here, and
 * deleting them would silently rewrite those years' figures.
 */
export function ManagePanel({ store }: { store: ClassicStore; entry: RegisterDirectoryEntry }) {
  const { blob, edit } = store;

  const [name, setName] = useState("");
  const [grade, setGrade] = useState("");
  const [email, setEmail] = useState("");
  const [date, setDate] = useState("");
  const [location, setLocation] = useState("");
  const [editingDay, setEditingDay] = useState<RegisterSession | null>(null);
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

  /**
   * A teaching day is published the moment it exists — there is no separate
   * "publish" step to skip or forget. The QR code and the check-in link are
   * just what a published day looks like, so creating it does both at once.
   */
  // The teaching day goes into the register; its check-in page and QR code
  // follow on their own a moment later (useClassicAutoPublishDays).
  const addSession = () => {
    if (!ISO_DATE.test(date) || !title.trim()) return;
    edit((b) => upsertSession(b, {
      id: newId(), title: title.trim(), date, month: date.slice(0, 7),
      location: location.trim(),
    }));
    setDate(""); setTitle(""); setLocation("");
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
          <div className="inline-form" style={{ gridTemplateColumns: "1.4fr .9fr" }}>
            <div>
              <input
                placeholder="Title e.g. Paediatric ENT WYT"
                aria-label="Title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div>
              <input type="date" aria-label="Date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
          <div className="inline-form" style={{ gridTemplateColumns: "1fr auto", marginTop: 8 }}>
            <div>
              <input
                placeholder="Location (optional)"
                aria-label="Location"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
            </div>
            <div>
              <button
                type="button"
                className="btn primary"
                disabled={!title.trim() || !ISO_DATE.test(date)}
                onClick={addSession}
              >
                Add
              </button>
            </div>
          </div>
          <p className="helper">
            Give each teaching day its exact date — a month can hold as many as
            it needs. Its QR code and check-in link are set up on their own as
            soon as it appears below.
          </p>

          <div style={{ marginTop: 8, maxHeight: 380, overflow: "auto" }}>
            {sessions.length === 0 ? (
              <div className="empty">No teaching days yet.</div>
            ) : (
              sessions.map((session) => (
                <div className="list-item" key={session.id}>
                  <div>
                    <div className="li-main">{session.title}</div>
                    <div className="li-sub">
                      {sessionWhen(session)}
                      {session.location ? ` · ${session.location}` : ""}
                      {session.cloudId ? " · live for check-in" : " · setting up…"}
                    </div>
                    {!session.date && (
                      <div className="li-sub" style={{ color: "var(--clay)" }}>
                        No exact date — use Edit to add it
                      </div>
                    )}
                  </div>
                  <div className="row-actions">
                    <button type="button" className="btn ghost sm" onClick={() => setEditingDay(session)}>
                      Edit
                    </button>
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

      {editingDay && (
        <EditDayDialog
          session={editingDay}
          onClose={() => setEditingDay(null)}
          onSave={(updated) => { edit((b) => upsertSession(b, updated)); setEditingDay(null); }}
        />
      )}

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

/**
 * A teaching day's title, date and place. Saving updates its live check-in
 * page too — useClassicAutoPublishDays notices the change and republishes.
 */
function EditDayDialog({
  session,
  onClose,
  onSave,
}: {
  session: RegisterSession;
  onClose: () => void;
  onSave: (session: RegisterSession) => void;
}) {
  const [title, setTitle] = useState(session.title);
  const [date, setDate] = useState(session.date ?? "");
  const [location, setLocation] = useState(session.location ?? "");
  const valid = !!title.trim() && ISO_DATE.test(date);

  return (
    <Modal
      title="Edit teaching day"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button
            type="button"
            className="btn primary"
            disabled={!valid}
            onClick={() => onSave({
              ...session, title: title.trim(), date, month: date.slice(0, 7), location: location.trim(),
            })}
          >
            Save
          </button>
        </>
      }
    >
      <div className="field">
        <label className="fld">Title</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="field">
        <label className="fld">Date</label>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        {!session.date && (
          <p className="helper">
            Recorded with only its month ({formatMonth(session.month)}). Give it its exact date to save.
          </p>
        )}
      </div>
      <div className="field" style={{ marginBottom: 0 }}>
        <label className="fld">Location (optional)</label>
        <input value={location} onChange={(e) => setLocation(e.target.value)} />
      </div>
    </Modal>
  );
}
