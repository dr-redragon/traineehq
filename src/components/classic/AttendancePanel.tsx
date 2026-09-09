import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AttendanceTable } from "@/components/classic/AttendanceTable";
import { pctColor } from "@/components/classic/pctColor";
import { YearTabs } from "@/components/classic/YearTabs";
import { Modal } from "@/components/classic/Modal";
import { toggleAttendance } from "@/lib/classic/blob";
import {
  ALL_YEARS, academicYearRange, availableAcademicYears, defaultAcademicYear,
  formatMonth, sessionsInYear, sessionsSorted,
} from "@/lib/classic/months";
import { buildReport, computeRows, reportSummary, type SortKey } from "@/lib/classic/report";
import { latestGrade } from "@/lib/classic/attendance";
import type { ClassicStore } from "@/components/classic/types";
import type { RegisterDirectoryEntry } from "@/lib/classic/types";

/**
 * The Attendance tab — the register's front page in the original.
 *
 * Two percentages per trainee, and the gap between them is the whole point:
 * raw counts every teaching day, adjusted removes the ones they could not have
 * attended (leave, CCT, a transfer) and then the ones they were excused from.
 * Adjusted is the figure a trainee is held to.
 *
 * Reporting lives behind the "Generate report" button here rather than in a tab
 * of its own, as it did originally.
 */
export function AttendancePanel({
  entry,
  store,
}: {
  entry: RegisterDirectoryEntry;
  store: ClassicStore;
}) {
  const { blob, edit } = store;
  const years = useMemo(() => availableAcademicYears(blob.sessions), [blob.sessions]);
  const [year, setYear] = useState(() => defaultAcademicYear(blob.sessions));
  const [search, setSearch] = useState("");
  const [hideNotInProgramme, setHide] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<1 | -1>(1);
  const [reportOpen, setReportOpen] = useState(false);

  const sort = (key: SortKey) => {
    if (key === sortKey) setSortDir((d) => (d === 1 ? -1 : 1));
    else { setSortKey(key); setSortDir(1); }
  };

  const options = { search, hideNotInProgramme, sortKey, sortDir };

  // One block per academic year when "All years" is picked, newest first; a
  // single block when one year is chosen.
  const labels = years.length ? (year === ALL_YEARS ? [...years].reverse() : [year]) : [null];

  const scopeSessions = year === ALL_YEARS || !years.length
    ? sessionsSorted(blob.sessions)
    : sessionsInYear(blob.sessions, year);
  const scopeRows = computeRows(blob, scopeSessions, options).rows;

  const eligible = scopeRows.filter((r) => r.eligible > 0);
  const meanAdjusted = eligible.length
    ? Math.round(eligible.reduce((s, r) => s + (r.adjPct || 0), 0) / eligible.length)
    : 0;
  const meanRaw = scopeRows.length
    ? Math.round(scopeRows.reduce((s, r) => s + r.rawPct, 0) / scopeRows.length)
    : 0;
  const atFull = eligible.filter((r) => r.adjPct === 100).length;
  const below60 = eligible.filter((r) => r.adjPct !== null && r.adjPct < 60).length;
  const scopeLabel = year === ALL_YEARS || !years.length ? "All years" : year;

  const emptyMessage = !blob.trainees.length
    ? "No trainees yet. Add some under “Trainees & sessions”."
    : !scopeSessions.length
      ? "No teaching days in this academic year yet — add one under “Trainees & sessions”."
      : "No trainees to show for this year.";

  const exportCsv = () => {
    const cell = (v: string | number) => {
      const s = String(v ?? "");
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = [
      "Trainee", "Grade", "Attended", "Eligible", "Excused",
      "Adjusted denominator", "Raw %", "Adjusted %",
      ...scopeSessions.map((s) => `${formatMonth(s.month)} — ${s.title}`),
    ];
    const lines = [header.map(cell).join(",")];
    for (const row of scopeRows) {
      lines.push([
        row.trainee.name,
        latestGrade(blob, row.trainee.id, scopeSessions),
        row.attended, row.eligible, row.excused, row.adjDenom,
        row.rawPct, row.adjPct === null ? "" : row.adjPct,
        ...row.cells.map((c) =>
          ({ present: "Attended", excused: "Excused", na: "Not eligible", absent: "Missed" })[c.state]),
      ].map(cell).join(","));
    }

    const blob_ = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob_);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${entry.slug}-attendance-${scopeLabel.replace("/", "-")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Exported");
  };

  return (
    <>
      <h2 className="panel-title">Attendance summary</h2>
      <p className="panel-lede">
        Each academic year runs August to July and has its own table — pick a
        year below. Live figures recalculated from check-ins, excused absences
        and long-term status. Adjusted attendance excludes excused sessions and
        any month a trainee was on leave or post-CCT from the denominator.
      </p>

      <YearTabs years={years} sessions={blob.sessions} value={year} onChange={setYear} />

      <div className="stat-strip">
        <div className="stat"><div className="n">{scopeRows.length}</div><div className="l">Trainees · {scopeLabel}</div></div>
        <div className="stat"><div className="n">{scopeSessions.length}</div><div className="l">Teaching days</div></div>
        <div className="stat"><div className="n">{meanAdjusted}%</div><div className="l">Mean adjusted</div></div>
        <div className="stat"><div className="n">{meanRaw}%</div><div className="l">Mean raw</div></div>
        <div className="stat"><div className="n">{atFull}</div><div className="l">At 100% adjusted</div></div>
        <div className="stat accent"><div className="n">{below60}</div><div className="l">Below 60%</div></div>
      </div>

      <div className="row-actions" style={{ marginBottom: 14 }}>
        <input
          placeholder="Search trainee…"
          style={{ maxWidth: 260 }}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <label
          className="mini-check"
          title="Hides trainees with no eligible sessions in the year — CCT'd, IDT'd out, or not yet arrived. Trainees on maternity/paternity or OOP leave stay visible even with no eligible sessions, since that's a leave, not a departure."
        >
          <input type="checkbox" checked={hideNotInProgramme} onChange={(e) => setHide(e.target.checked)} />
          {" "}Hide trainees not in programme
        </label>
        <button type="button" className="btn ghost sm" onClick={exportCsv}>Export CSV</button>
        <button type="button" className="btn primary sm" onClick={() => setReportOpen(true)}>
          Generate report
        </button>
      </div>

      {labels.map((label) => {
        const sessions = label ? sessionsInYear(blob.sessions, label) : [];
        const { rows, hidden } = computeRows(blob, sessions, options);
        return (
          <div className="year-block" key={label ?? "none"}>
            {labels.length > 1 && label && (
              <div className="year-block-head">
                <h3>{label}</h3>
                <span className="meta">
                  {academicYearRange(label)} · {sessions.length} teaching day
                  {sessions.length !== 1 ? "s" : ""}
                </span>
              </div>
            )}
            <AttendanceTable
              blob={blob}
              rows={rows}
              sessions={sessions}
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={sort}
              onToggle={(traineeId, sessionId) =>
                edit((b) => toggleAttendance(b, traineeId, sessionId))}
              emptyMessage={emptyMessage}
            />
            {hidden > 0 && label && (
              <div className="hidden-note">
                {hidden} trainee{hidden !== 1 ? "s" : ""} hidden — not in the
                programme for any session in {label}.
              </div>
            )}
          </div>
        );
      })}

      <div className="legend">
        <span><span className="dot present">✓</span> Attended</span>
        <span><span className="dot absent" /> Missed</span>
        <span><span className="dot excused">e</span> Excused</span>
        <span><span className="dot na">–</span> Not eligible (leave / pre-start / post-CCT)</span>
      </div>

      {reportOpen && (
        <ReportDialog
          store={store}
          registerName={entry.name}
          years={years}
          initialYear={year}
          onClose={() => setReportOpen(false)}
        />
      )}
    </>
  );
}

/**
 * The report builder, and the report.
 *
 * Kept behind a modal, as it was originally: it is an occasional, deliberate act
 * — something taken to an ARCP panel — not part of reading the register day to
 * day. Printing is the browser's, so the report is laid out on the page and the
 * controls carry `print:hidden` duties by being removed before printing.
 */
function ReportDialog({
  store,
  registerName,
  years,
  initialYear,
  onClose,
}: {
  store: ClassicStore;
  registerName: string;
  years: string[];
  initialYear: string;
  onClose: () => void;
}) {
  const [chosen, setChosen] = useState<string[]>(() =>
    initialYear === ALL_YEARS ? years : [initialYear].filter(Boolean));
  const [layout, setLayout] = useState<"per" | "combined" | "both">("per");
  const [includeCct, setIncludeCct] = useState(false);
  const [includeIdtOut, setIncludeIdtOut] = useState(false);
  const [hideNoEligible, setHideNoEligible] = useState(true);
  const [report, setReport] = useState<ReturnType<typeof buildReport> | null>(null);

  const toggleYear = (year: string) =>
    setChosen((c) => (c.includes(year) ? c.filter((y) => y !== year) : [...c, year]));

  if (report) {
    const overall = reportSummary(report.overall);
    return (
      <Modal
        title={`Report — ${registerName}`}
        onClose={onClose}
        footer={
          <>
            <button type="button" className="btn ghost" onClick={() => setReport(null)}>
              Change options
            </button>
            <button type="button" className="btn primary" onClick={() => window.print()}>
              Print
            </button>
          </>
        }
      >
        <div className="stat-strip">
          <div className="stat"><div className="n">{report.overall.length}</div><div className="l">Trainees</div></div>
          <div className="stat"><div className="n">{report.sessions.length}</div><div className="l">Teaching days</div></div>
          <div className="stat">
            <div className="n" style={{ color: pctColor(overall.adjPct) }}>
              {overall.adjPct === null ? "—" : `${overall.adjPct}%`}
            </div>
            <div className="l">Adjusted overall</div>
          </div>
          <div className="stat accent"><div className="n">{overall.below60}</div><div className="l">Below 60%</div></div>
        </div>

        {report.sections.map((section) => (
          <div className="year-block" key={section.title}>
            <div className="year-block-head">
              <h3>{section.title}</h3>
              <span className="meta">{section.subtitle}</span>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th className="no-sort">Trainee</th>
                    <th className="no-sort">Attended</th>
                    <th className="no-sort">Excused</th>
                    <th className="no-sort">Eligible</th>
                    <th className="no-sort">Adjusted %</th>
                  </tr>
                </thead>
                <tbody>
                  {section.rows.map((row) => (
                    <tr key={row.trainee.id}>
                      <td className="name-cell">{row.trainee.name}</td>
                      <td>{row.attended}</td>
                      <td>{row.excused}</td>
                      <td>{row.eligible}</td>
                      <td>
                        <span className="pct" style={{ color: pctColor(row.adjPct) }}>
                          {row.adjPct === null ? "—" : `${row.adjPct}%`}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </Modal>
    );
  }

  return (
    <Modal
      title="Generate report"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button
            type="button"
            className="btn primary"
            disabled={chosen.length === 0}
            onClick={() =>
              setReport(buildReport(store.blob, {
                years: chosen, layout, includeCct, includeIdtOut, hideNoEligible,
              }))}
          >
            Generate
          </button>
        </>
      }
    >
      <label className="fld">Academic years</label>
      <div className="row-actions">
        {years.map((year) => (
          <label key={year} className={"yr-pill" + (chosen.includes(year) ? " on" : "")}>
            <input type="checkbox" checked={chosen.includes(year)} onChange={() => toggleYear(year)} />
            {year}
          </label>
        ))}
      </div>
      <div className="report-yr-actions">
        <button type="button" className="linkbtn" onClick={() => setChosen(years)}>All</button>
        <button type="button" className="linkbtn" onClick={() => setChosen([])}>None</button>
      </div>

      {chosen.length > 1 && (
        <>
          <label className="fld" style={{ marginTop: 16 }}>Layout</label>
          <div className="seg">
            <button type="button" className={layout === "per" ? "on" : ""} onClick={() => setLayout("per")}>
              A table per year
            </button>
            <button type="button" className={layout === "combined" ? "on" : ""} onClick={() => setLayout("combined")}>
              One combined table
            </button>
            <button type="button" className={layout === "both" ? "on" : ""} onClick={() => setLayout("both")}>
              Both
            </button>
          </div>
        </>
      )}

      <label className="fld" style={{ marginTop: 16 }}>Who to include</label>
      <label className="report-check">
        <input type="checkbox" checked={hideNoEligible} onChange={(e) => setHideNoEligible(e.target.checked)} />
        Leave out trainees not in the programme for this period
      </label>
      <label className="report-check">
        <input type="checkbox" checked={includeCct} onChange={(e) => setIncludeCct(e.target.checked)} />
        Include trainees who have completed training (CCT)
      </label>
      <label className="report-check">
        <input type="checkbox" checked={includeIdtOut} onChange={(e) => setIncludeIdtOut(e.target.checked)} />
        Include trainees who transferred out
      </label>
      <p className="helper">
        Anyone on maternity, paternity or out-of-programme leave is kept whatever
        is chosen here — that is a leave, not a departure.
      </p>
    </Modal>
  );
}
