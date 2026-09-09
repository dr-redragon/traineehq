import { useState } from "react";
import { MonthInput } from "@/components/classic/MonthInput";
import { newId, removeStatus, upsertStatus } from "@/lib/classic/blob";
import { STATUS_LABELS, STATUS_OPTIONS, statusRangeText } from "@/lib/classic/statusText";
import type { ClassicStore } from "@/components/classic/types";
import type { RegisterStatus } from "@/lib/classic/types";

/**
 * Long-term status: the windows in which a trainee is, or is not, expected.
 *
 * Sessions outside a trainee's active window are "not eligible" and leave BOTH
 * the numerator and the denominator — which is the difference between a register
 * that reports fairly and one that penalises somebody for a teaching day held
 * while they were on maternity leave or had already completed training.
 *
 * Each type reads its two month fields differently, so the helper line under
 * the form restates what the dates will mean rather than making the organiser
 * infer it.
 */
export function StatusPanel({ store }: { store: ClassicStore }) {
  const { blob, edit } = store;
  const [editingId, setEditingId] = useState<string | null>(null);
  const [traineeId, setTraineeId] = useState("");
  const [type, setType] = useState<RegisterStatus["type"]>("active");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");

  const trainees = [...blob.trainees].sort((a, b) => a.name.localeCompare(b.name));
  const nameOf = (id: string) => blob.trainees.find((t) => t.id === id)?.name ?? "Unknown trainee";
  const hint = STATUS_OPTIONS.find((o) => o.value === type)?.hint ?? "";

  // CCT and the two transfers are a single threshold, not a window.
  const oneDateOnly = type === "cct" || type === "idt_in" || type === "idt_out";

  const reset = () => {
    setEditingId(null);
    setTraineeId("");
    setType("active");
    setStart("");
    setEnd("");
  };

  const save = () => {
    if (!traineeId) return;
    edit((b) => upsertStatus(b, {
      id: editingId ?? newId(),
      trainee: traineeId,
      type,
      start: start || null,
      end: end || null,
    }));
    reset();
  };

  const beginEdit = (status: RegisterStatus) => {
    setEditingId(status.id);
    setTraineeId(status.trainee);
    setType(status.type);
    setStart(status.start ?? "");
    setEnd(status.end ?? "");
  };

  const rows = [...blob.status].sort((a, b) => nameOf(a.trainee).localeCompare(nameOf(b.trainee)));

  return (
    <>
      <h2 className="panel-title">Long-term status</h2>
      <p className="panel-lede">
        Set when a trainee completes training (CCT), goes on maternity /
        paternity leave, out-of-programme (OOP/PhD), or transfers (IDT). Sessions
        outside their active window are marked “not eligible” and excluded from
        both numerator and denominator.
      </p>

      <div className="card pad" style={{ marginBottom: 20 }}>
        {editingId && (
          <div style={{
            marginBottom: 14, padding: "8px 12px", background: "#f0f4ee",
            border: "1px solid var(--moss)", borderRadius: 8, fontSize: 13,
            fontWeight: 600, color: "var(--moss-deep)",
          }}>
            Editing {nameOf(traineeId)}'s {STATUS_LABELS[type]} record.
          </div>
        )}

        <div className="grid2">
          <div className="field">
            <label className="fld">Trainee</label>
            <select value={traineeId} onChange={(e) => setTraineeId(e.target.value)}>
              <option value="">Trainee…</option>
              {trainees.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label className="fld">Status type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as RegisterStatus["type"])}
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>

        {type !== "active" && (
          <div className="grid2">
            <div className="field">
              <label className="fld">
                {type === "cct" ? "Completes after (month)"
                  : oneDateOnly ? "Takes effect (month)" : "Start (month)"}
              </label>
              <MonthInput
                value={type === "cct" ? end : start}
                onChange={type === "cct" ? setEnd : setStart}
              />
            </div>
            {!oneDateOnly && (
              <div className="field">
                <label className="fld">End (month)</label>
                <MonthInput value={end} onChange={setEnd} />
              </div>
            )}
          </div>
        )}

        <p className="helper">{hint}</p>

        <div className="row-actions" style={{ marginTop: 6 }}>
          <button
            type="button"
            className="btn primary"
            disabled={!traineeId || store.isSaving}
            onClick={save}
          >
            Save status
          </button>
          {editingId && (
            <button type="button" className="btn ghost" onClick={reset}>Cancel edit</button>
          )}
        </div>
      </div>

      <div className="card">
        {rows.length === 0 ? (
          <div className="empty">
            Nobody has a long-term status yet — every trainee counts for every
            teaching day.
          </div>
        ) : (
          rows.map((status) => (
            <div className="list-item" key={status.id}>
              <div>
                <div className="li-main">{nameOf(status.trainee)}</div>
                <div className="li-sub">
                  <span className={`badge ${status.type}`}>{STATUS_LABELS[status.type]}</span>
                  {" "}{statusRangeText(status)}
                </div>
              </div>
              <div className="row-actions">
                <button type="button" className="btn ghost sm" onClick={() => beginEdit(status)}>
                  Edit
                </button>
                <button
                  type="button"
                  className="btn ghost sm"
                  onClick={() => edit((b) => removeStatus(b, status.id))}
                >
                  Remove
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );
}
