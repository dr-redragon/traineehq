import { useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AttendanceCellPopover } from "@/components/register/AttendanceCellPopover";
import { CELL, CELL_LABEL, CELL_LEGEND, CELL_MARK } from "@/components/register/attendanceCell";
import { activeStatusType } from "@/lib/register/eligibility";
import { STATUS_SHORT, statusRangeText } from "@/lib/register/statusText";
import { computeRows, type SortKey } from "@/lib/register/report";
import { sessionWhen, todayIso } from "@/lib/register/months";
import { attendanceKey, gradeAt } from "@/lib/register/attendance";
import { toggleAttendance } from "@/lib/register/blob";
import { useTouchInput } from "@/hooks/useTouchInput";
import type { RegisterBlob, RegisterSession } from "@/lib/register/types";
import type { RegisterEdit } from "@/hooks/useRegisterStore";
import { cn } from "@/lib/utils";

/**
 * How an adjusted figure is drawn, in the register's two bands: 80 and 60 per
 * cent. At or above 80 it is plain ink. Between 60 and 80 it takes the accent
 * at text weight on a pale tint. Below 60 it is a solid accent flag — something
 * you can see across a room. The bar under it runs to the figure, with a tick
 * at the 80% expectation. Every colour is a token, so the bands follow the
 * person's colour scheme.
 */
function adjustedBand(pct: number | null) {
  if (pct === null) return { chip: "text-muted-foreground", bar: "bg-transparent" };
  if (pct >= 80) return { chip: "text-foreground", bar: "bg-foreground" };
  if (pct >= 60) return { chip: "bg-accent text-accent-deep", bar: "bg-rule/60" };
  return { chip: "bg-primary text-primary-foreground", bar: "bg-rule" };
}

/** A teaching day's header on two short lines — "18 Nov" over "2026" — so its column stays narrow. */
function whenLines(s: RegisterSession): [string, string] {
  const parts = sessionWhen(s).split(" ");
  return parts.length > 1 ? [parts.slice(0, -1).join(" "), parts[parts.length - 1]] : [parts[0], ""];
}

/** The filter and sort a grid is shown with, when its parent owns them. */
export interface GridOptions {
  search: string;
  hideNotInProgramme: boolean;
  sortKey: SortKey;
  sortDir: 1 | -1;
}

export function AttendanceGrid({
  blob, sessions, onEdit, canEdit, onToggle, options, onSort, bare = false, emptyMessage,
  selectedSessionId, onSelectSession,
}: {
  blob: RegisterBlob;
  sessions: RegisterSession[];
  onEdit: (edit: RegisterEdit) => void;
  canEdit: boolean;
  /**
   * Told about every mark changed here, so the same change can reach the
   * published teaching day. A tick in this grid is a check-in; without this the
   * live sign-in list and the grid drift apart the moment anybody uses either.
   */
  onToggle?: (traineeId: string, sessionId: string, nowPresent: boolean) => void;
  /**
   * Search, filter and sort owned by the parent — the attendance tab shows one
   * grid per academic year under a single set of controls, and all of them
   * have to answer to it. Left out, the grid keeps its own.
   */
  options?: GridOptions;
  onSort?: (key: SortKey) => void;
  /** Just the table: no search row, legend or footnote. */
  bare?: boolean;
  emptyMessage?: string;
  /** The teaching day whose column is lit up, and whose details are open beside the grid. */
  selectedSessionId?: string | null;
  /** Given, each teaching day's header becomes a button that picks that day. */
  onSelectSession?: (sessionId: string) => void;
}) {
  const [ownSearch, setSearch] = useState("");
  const [ownHide, setHideNotInProgramme] = useState(true);
  const [ownSortKey, setSortKey] = useState<SortKey>("name");
  const [ownSortDir, setSortDir] = useState<1 | -1>(1);

  const search = options?.search ?? ownSearch;
  const hideNotInProgramme = options?.hideNotInProgramme ?? ownHide;
  const sortKey = options?.sortKey ?? ownSortKey;
  const sortDir = options?.sortDir ?? ownSortDir;

  // The one cell showing its details, and the button it belongs to — the
  // popover is positioned against that. At most one is open, so the grid
  // carries a single popover rather than one per cell: a register of thirty
  // trainees over a year is several hundred cells.
  const [openCell, setOpenCell] = useState<{ key: string; anchor: HTMLElement } | null>(null);
  const lastInputWasTouch = useTouchInput();
  // The cell whose popover was just dismissed, and when. See the click handler.
  const dismissed = useRef<{ key: string; at: number } | null>(null);

  const closePopover = () => {
    if (openCell) dismissed.current = { key: openCell.key, at: Date.now() };
    setOpenCell(null);
  };

  const { rows, hidden } = useMemo(
    () => computeRows(blob, sessions, { search, hideNotInProgramme, sortKey, sortDir, asOf: todayIso() }),
    [blob, sessions, search, hideNotInProgramme, sortKey, sortDir],
  );

  /**
   * Flip one cell, and tell the live teaching day about it.
   *
   * The edit is a function of the current blob rather than a finished one:
   * `useRegisterStore` replays it against whatever a colleague saved in the
   * meantime, and replaying a snapshot would undo their work.
   */
  const flip = (traineeId: string, sessionId: string, nowPresent: boolean) => {
    onEdit((b) => toggleAttendance(b, traineeId, sessionId));
    onToggle?.(traineeId, sessionId, nowPresent);
  };

  const sortBy = (key: SortKey) => {
    if (onSort) { onSort(key); return; }
    if (key === sortKey) setSortDir((d) => (d === 1 ? -1 : 1));
    else { setSortKey(key); setSortDir(key === "name" ? 1 : -1); }
  };

  const SortIcon = ({ k }: { k: SortKey }) =>
    k !== sortKey ? <ChevronsUpDown className="ml-1 inline h-3 w-3 opacity-40" />
      : sortDir === 1 ? <ArrowUp className="ml-1 inline h-3 w-3" />
      : <ArrowDown className="ml-1 inline h-3 w-3" />;

  return (
    <div className="space-y-3">
      {!bare && (
        <div className="flex flex-wrap items-center gap-3">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search trainees"
            className="h-8 w-full text-xs sm:w-56"
          />
          <Label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
            <Checkbox
              checked={hideNotInProgramme}
              onCheckedChange={(v) => setHideNotInProgramme(v === true)}
            />
            Hide trainees not in programme
          </Label>
          {hidden > 0 && (
            <span className="text-xs text-muted-foreground">{hidden} hidden</span>
          )}
        </div>
      )}

      {/* A register can run a dozen teaching days; the table scrolls inside its
          own box rather than pushing the page sideways on a phone. It sits on
          the page itself rather than in a card: a strong rule over the header,
          hairlines between rows, and nothing else — the grid does the
          organising. */}
      <div className="overflow-x-auto border-t-2 border-foreground">
        <table className="w-full min-w-[560px] border-collapse font-body text-sm">
          <thead>
            <tr className="border-b border-border text-left align-bottom text-[11px] uppercase tracking-[0.1em] text-muted-foreground [&_th]:font-bold">
              <th
                // `w-full` hands every spare pixel to the name column, so the
                // day columns stay tight however wide the page is.
                className="sticky left-0 z-10 w-full cursor-pointer bg-background py-2 pl-2 pr-3"
                onClick={() => sortBy("name")}
              >
                Trainee <SortIcon k="name" />
              </th>
              <th className="whitespace-nowrap px-1 py-2">Status</th>
              {sessions.map((s) => {
                const [top, bottom] = whenLines(s);
                const picked = s.id === selectedSessionId;
                const label = (
                  <span className="flex flex-col items-center leading-tight">
                    <span className="whitespace-nowrap">{top}</span>
                    {bottom && (
                      <span className={cn("font-normal", picked ? "opacity-80" : "text-muted-foreground/80")}>
                        {bottom}
                      </span>
                    )}
                  </span>
                );
                return (
                  <th key={s.id} className="min-w-[44px] p-0 text-center" title={s.title}>
                    {onSelectSession ? (
                      <button
                        type="button"
                        aria-pressed={picked}
                        aria-label={`${s.title} (${sessionWhen(s)}) — show this teaching day`}
                        onClick={() => onSelectSession(s.id)}
                        className={cn(
                          "flex w-full justify-center px-0.5 py-2 text-[10.5px] font-bold normal-case tracking-normal transition-colors",
                          picked
                            ? "bg-primary text-primary-foreground"
                            : "text-muted-foreground hover:bg-accent hover:text-foreground",
                        )}
                      >
                        {label}
                      </button>
                    ) : (
                      <span className="flex justify-center px-0.5 py-2 text-[10.5px] normal-case tracking-normal">{label}</span>
                    )}
                  </th>
                );
              })}
              <th className="cursor-pointer whitespace-nowrap px-2 py-2 text-right" onClick={() => sortBy("att")}>
                Att/Elig <SortIcon k="att" />
              </th>
              <th className="cursor-pointer whitespace-nowrap px-2 py-2 text-right" onClick={() => sortBy("raw")}>
                Raw <SortIcon k="raw" />
              </th>
              <th className="w-[150px] cursor-pointer whitespace-nowrap py-2 pl-3 pr-2 text-right" onClick={() => sortBy("adj")}>
                Adjusted <SortIcon k="adj" />
              </th>
            </tr>
          </thead>

          <tbody>
            {rows.map((row) => {
              const status = activeStatusType(
                blob, row.trainee.id, sessions[sessions.length - 1]?.month,
              );
              const band = adjustedBand(row.adjPct);

              return (
                <tr key={row.trainee.id} className="group border-b border-border/60 transition-colors hover:bg-accent">
                  <td className="sticky left-0 z-10 bg-background py-1 pl-2 pr-3 transition-colors group-hover:bg-accent">
                    {/* Name and grade on one line: half the height of a row
                        that stacks them, which is most of what makes the grid
                        compact. */}
                    <span className="flex min-w-0 items-baseline gap-2">
                      <span className="max-w-[180px] truncate text-[14px] font-semibold">
                        {row.trainee.name}
                      </span>
                      {row.trainee.grade && (
                        <span className="shrink-0 text-[11.5px] text-muted-foreground">
                          {row.trainee.grade}
                        </span>
                      )}
                    </span>
                  </td>

                  <td className="px-1 py-1">
                    {status && (
                      // The specific status, and the dates behind it on hover:
                      // "Leave" for both maternity and out-of-programme would
                      // hide a difference that matters at an ARCP. A small
                      // square tag, so the column costs no more than it needs.
                      <span
                        className="inline-block whitespace-nowrap bg-muted px-1.5 py-px text-[10px] font-bold uppercase tracking-[0.04em] text-muted-foreground"
                        title={statusRangeText(status)}
                      >
                        {STATUS_SHORT[status.type]}
                      </span>
                    )}
                  </td>

                  {row.cells.map((cell) => {
                    const key = attendanceKey(row.trainee.id, cell.session.id);
                    const open = openCell?.key === key;
                    const picked = cell.session.id === selectedSessionId;
                    const grade = gradeAt(blob, row.trainee.id, cell.session.id);
                    // "Not eligible" is a derived fact, not a mark — it comes
                    // from a status window, so it is changed there, not here.
                    const editable = canEdit && cell.state !== "na";
                    const described =
                      `${row.trainee.name} — ${cell.session.title} ` +
                      `(${sessionWhen(cell.session)}) · ${CELL_LABEL[cell.state]}` +
                      (grade ? ` · ${grade}` : "");

                    const mark = (
                      <button
                        type="button"
                        /*
                          Never `disabled`: a cell nobody may change is exactly
                          the cell somebody on a phone most wants explained, and
                          a disabled button receives no tap to explain it with.
                          Inert to a mouse, reachable to a finger and a screen
                          reader — which is what aria-disabled says.
                        */
                        aria-disabled={!editable}
                        aria-expanded={open}
                        onClick={(e) => {
                          if (lastInputWasTouch()) {
                            // The tap that dismissed this popover also lands on
                            // the cell underneath. Without this, tapping an open
                            // cell closes and immediately reopens it, which
                            // looks like nothing happened at all.
                            const just = dismissed.current;
                            if (just && just.key === key && Date.now() - just.at < 300) {
                              dismissed.current = null;
                              return;
                            }
                            setOpenCell({ key, anchor: e.currentTarget });
                            return;
                          }
                          if (!editable) return;
                          flip(row.trainee.id, cell.session.id, cell.state !== "present");
                        }}
                        title={described}
                        aria-label={described}
                        className={cn(
                          "inline-flex h-[26px] w-[26px] items-center justify-center text-xs font-bold transition-colors",
                          "hover:outline hover:outline-2 hover:outline-offset-1 hover:outline-rule",
                          CELL[cell.state],
                          !editable && "cursor-default hover:outline-none",
                        )}
                      >
                        {CELL_MARK[cell.state]}
                      </button>
                    );

                    return (
                      <td
                        key={cell.session.id}
                        className={cn("px-0.5 py-1 text-center", picked && "bg-accent-strong")}
                      >
                        {mark}
                        {open && openCell && (
                          <AttendanceCellPopover
                            anchor={openCell.anchor}
                            trainee={row.trainee}
                            session={cell.session}
                            state={cell.state}
                            grade={grade}
                            canEdit={editable}
                            onClose={closePopover}
                            onToggle={() => {
                              closePopover();
                              flip(row.trainee.id, cell.session.id, cell.state !== "present");
                            }}
                          />
                        )}
                      </td>
                    );
                  })}

                  <td className="px-2 py-1 text-right text-[13px] tabular-nums text-muted-foreground">
                    {row.attended}/{row.adjDenom > 0 ? row.adjDenom : row.eligible}
                  </td>
                  <td className="px-2 py-1 text-right text-[13px] tabular-nums text-muted-foreground">
                    {row.total ? `${row.rawPct}%` : "—"}
                  </td>
                  <td className="py-1 pl-3 pr-2">
                    <div className="flex items-center justify-end gap-2.5">
                      {/* The bar tracks the adjusted figure; the ink tick is the
                          80% every trainee is expected to reach. */}
                      <div
                        aria-hidden="true"
                        className="relative h-1.5 w-16 shrink-0 bg-foreground/15"
                      >
                        <div
                          className={cn("absolute inset-y-0 left-0", band.bar)}
                          style={{ width: `${row.adjPct ?? 0}%` }}
                        />
                        <div className="absolute -inset-y-[3px] left-[80%] w-0.5 bg-foreground" />
                      </div>
                      <span
                        className={cn(
                          "min-w-[46px] px-1.5 py-0.5 text-right text-[13.5px] font-extrabold tabular-nums",
                          band.chip,
                        )}
                      >
                        {row.adjPct === null ? "—" : `${row.adjPct}%`}
                      </span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {rows.length === 0 && (
          <p className="px-3 py-8 text-center text-sm text-muted-foreground">
            {emptyMessage ?? (blob.trainees.length === 0
              ? "No trainees yet — add some on the People tab."
              : sessions.length === 0
                ? "No teaching days in this year yet."
                : "No trainees match.")}
          </p>
        )}
      </div>

      {!bare && <AttendanceLegend />}
    </div>
  );
}

/** What the marks mean, and what the two percentages count. */
export function AttendanceLegend() {
  return (
    <>
      <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-[12px] text-muted-foreground">
        {(["present", "excused", "absent", "na", "upcoming"] as const).map((state) => (
          <span key={state} className="inline-flex items-center gap-2">
            <span
              aria-hidden="true"
              className={cn(
                "inline-flex h-[18px] w-[18px] items-center justify-center text-[11px] font-bold",
                CELL[state],
              )}
            >
              {CELL_MARK[state]}
            </span>
            {CELL_LEGEND[state]}
          </span>
        ))}
      </div>
      <p className="text-[11px] text-muted-foreground">
        <strong>Adjusted</strong> drops months a trainee was not in programme, then excused
        absences, from the denominator. <strong>Raw</strong> counts every teaching day in the
        year. An adjusted figure of “—” means none of these days were ever theirs to attend.
        The tick on each bar marks the 80% expectation.
      </p>
    </>
  );
}
