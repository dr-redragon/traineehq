import { useRef, useState } from "react";
import { pctColor } from "@/components/classic/pctColor";
import { formatMonth } from "@/lib/classic/months";
import { activeStatusType } from "@/lib/classic/eligibility";
import { gradeAt, latestGrade } from "@/lib/classic/attendance";
import { STATUS_SHORT } from "@/lib/classic/statusText";
import type { AttendanceRow, SortKey } from "@/lib/classic/report";
import type { RegisterBlob, RegisterSession } from "@/lib/classic/types";

const STATE_SYMBOL: Record<string, string> = {
  present: "✓", excused: "e", na: "–", absent: "",
};
const STATE_LABEL: Record<string, string> = {
  present: "Attended", excused: "Excused", na: "Not eligible", absent: "Missed",
};
const STATE_DOT: Record<string, string> = {
  Attended: "s-present", Excused: "s-excused", Missed: "s-absent", "Not eligible": "s-na",
};

interface CellDetail {
  traineeId: string;
  sessionId: string;
  name: string;
  session: string;
  month: string;
  state: string;
  grade: string;
  eligible: boolean;
}

/**
 * The attendance grid: one row per trainee, one dot per teaching day.
 *
 * Two ways of reading a cell, kept from the original because they solve
 * different problems. With a mouse, hovering explains the cell and a click
 * toggles it. On a touch screen hovering does not exist — the tap that would
 * show a tip also silently flipped the attendance underneath it — so the first
 * tap opens a popover that only explains, and changing the mark takes a second,
 * deliberate tap on a button inside it.
 */
export function AttendanceTable({
  blob,
  rows,
  sessions,
  sortKey,
  sortDir,
  onSort,
  onToggle,
  emptyMessage,
}: {
  blob: RegisterBlob;
  rows: AttendanceRow[];
  sessions: RegisterSession[];
  sortKey: SortKey;
  sortDir: 1 | -1;
  onSort: (key: SortKey) => void;
  onToggle: (traineeId: string, sessionId: string) => void;
  emptyMessage: string;
}) {
  const [tip, setTip] = useState<{ x: number; y: number; detail: CellDetail } | null>(null);
  const [pop, setPop] = useState<CellDetail | null>(null);

  /**
   * Whether the last press on a cell came from a finger.
   *
   * Read from the pointer event itself rather than from a `(hover: hover)` media
   * query, because a laptop with a touchscreen answers yes to that query and is
   * still being tapped. The original register tracked the same fact the same
   * way, for the same reason.
   */
  const touched = useRef(false);

  const arrow = (k: SortKey) => (
    <span className="arrow">{sortKey === k ? (sortDir > 0 ? "▲" : "▼") : "↕"}</span>
  );

  // Scoped to the block being drawn, so a past year shows the leave that applied
  // then rather than "Active" read back from today.
  const cutoff = sessions.length ? sessions[sessions.length - 1].month : undefined;

  const detailFor = (row: AttendanceRow, cell: AttendanceRow["cells"][number]): CellDetail => ({
    traineeId: row.trainee.id,
    sessionId: cell.session.id,
    name: row.trainee.name,
    session: cell.session.title,
    month: formatMonth(cell.session.month),
    state: STATE_LABEL[cell.state],
    grade: cell.state === "present" ? gradeAt(blob, row.trainee.id, cell.session.id) : "",
    eligible: cell.state !== "na",
  });

  return (
    <>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th onClick={() => onSort("name")}>Trainee {arrow("name")}</th>
              <th className="no-sort">Status</th>
              <th className="no-sort">Sessions</th>
              <th onClick={() => onSort("att")}>Att/Elig {arrow("att")}</th>
              <th onClick={() => onSort("raw")}>Raw % {arrow("raw")}</th>
              <th onClick={() => onSort("adj")}>Adjusted % {arrow("adj")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 || sessions.length === 0 ? (
              <tr><td colSpan={6}><div className="empty">{emptyMessage}</div></td></tr>
            ) : (
              rows.map((row) => {
                const status = activeStatusType(blob, row.trainee.id, cutoff);
                const adj = row.adjPct === null ? "—" : `${row.adjPct}%`;
                return (
                  <tr key={row.trainee.id}>
                    <td className="name-cell">
                      {row.trainee.name}
                      <span className="grade-tag">{latestGrade(blob, row.trainee.id, sessions)}</span>
                    </td>
                    <td>
                      {status ? (
                        <span className={`badge ${status.type}`}>
                          {STATUS_SHORT[status.type]}
                          {(status.start || status.end)
                            ? ` · ${formatMonth(status.start || status.end)}`
                            : ""}
                        </span>
                      ) : (
                        <span className="badge active">Active</span>
                      )}
                    </td>
                    <td>
                      <div className="sess-cells">
                        {row.cells.map((cell) => {
                          const detail = detailFor(row, cell);
                          return (
                            <span
                              key={cell.session.id}
                              className={`dot ${cell.state}`}
                              onMouseEnter={(e) =>
                                setTip({ x: e.clientX, y: e.clientY, detail })}
                              onMouseMove={(e) =>
                                setTip({ x: e.clientX, y: e.clientY, detail })}
                              onMouseLeave={() => setTip(null)}
                              onPointerDown={(e) => { touched.current = e.pointerType === "touch"; }}
                              onClick={() => {
                                // No mouse behind the tap: explain first, and
                                // let a second, deliberate tap inside the
                                // popover be what changes anything.
                                if (touched.current) {
                                  setPop(detail);
                                  return;
                                }
                                if (detail.eligible) onToggle(detail.traineeId, detail.sessionId);
                              }}
                            >
                              {STATE_SYMBOL[cell.state]}
                            </span>
                          );
                        })}
                      </div>
                    </td>
                    <td style={{ fontVariantNumeric: "tabular-nums" }}>
                      {row.attended}/{row.adjDenom > 0 ? row.adjDenom : row.eligible}
                    </td>
                    <td>
                      <span className="pct" style={{ color: pctColor(row.rawPct) }}>{row.rawPct}%</span>
                      <div className="pct-bar">
                        <span style={{ width: `${row.rawPct}%`, background: pctColor(row.rawPct) }} />
                      </div>
                    </td>
                    <td>
                      <span className="pct" style={{ color: pctColor(row.adjPct) }}>{adj}</span>
                      <div className="pct-bar">
                        <span style={{ width: `${row.adjPct ?? 0}%`, background: pctColor(row.adjPct) }} />
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {tip && (
        <div className="show" id="cellTip" style={{ left: tip.x + 14, top: tip.y + 16 }}>
          <div className="tip-sess">{tip.detail.session}</div>
          <div className="tip-month">{tip.detail.month}</div>
          <div className="tip-row">
            <span className={`tip-state ${STATE_DOT[tip.detail.state]}`} />
            {tip.detail.state}{tip.detail.grade ? ` · ${tip.detail.grade}` : ""}
          </div>
        </div>
      )}

      {pop && (
        <div className="show" id="cellPop" role="dialog" aria-label="Attendance for this session">
          <div className="pop-sess">{pop.session}</div>
          <div className="pop-month">{pop.month}</div>
          <div className="pop-row">
            <span className={`pop-state ${STATE_DOT[pop.state]}`} />
            {pop.name} — {pop.state}{pop.grade ? ` · ${pop.grade}` : ""}
          </div>
          {pop.eligible ? (
            <div className="pop-actions">
              <button type="button" onClick={() => setPop(null)}>Close</button>
              <button
                type="button"
                className="go"
                onClick={() => { onToggle(pop.traineeId, pop.sessionId); setPop(null); }}
              >
                {pop.state === "Attended" ? "Mark absent" : "Mark present"}
              </button>
            </div>
          ) : (
            <>
              <div className="pop-note">
                Outside this trainee's active window, so it counts towards neither
                figure and cannot be marked.
              </div>
              <div className="pop-actions">
                <button type="button" onClick={() => setPop(null)}>Close</button>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
