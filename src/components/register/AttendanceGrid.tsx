import { useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AttendanceCellPopover } from "@/components/register/AttendanceCellPopover";
import { CELL, CELL_LABEL, CELL_LEGEND, CELL_MARK } from "@/components/register/attendanceCell";
import { activeStatusType } from "@/lib/register/eligibility";
import { STATUS_SHORT, statusRangeText } from "@/lib/register/statusText";
import { computeRows, type SortKey } from "@/lib/register/report";
import { formatMonth } from "@/lib/register/months";
import { attendanceKey, gradeAt } from "@/lib/register/attendance";
import { toggleAttendance } from "@/lib/register/blob";
import { useTouchInput } from "@/hooks/useTouchInput";
import type { RegisterBlob, RegisterSession } from "@/lib/register/types";
import type { RegisterEdit } from "@/hooks/useRegisterStore";
import { cn } from "@/lib/utils";

/** The colour bands the original register used: 80 and 60 per cent. */
function pctClass(pct: number | null) {
  if (pct === null) return "text-muted-foreground";
  if (pct >= 80) return "text-success";
  if (pct >= 60) return "text-warning";
  return "text-destructive";
}

export function AttendanceGrid({
  blob, sessions, onEdit, canEdit, onToggle,
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
}) {
  const [search, setSearch] = useState("");
  const [hideNotInProgramme, setHideNotInProgramme] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<1 | -1>(1);

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
    () => computeRows(blob, sessions, { search, hideNotInProgramme, sortKey, sortDir }),
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
    if (key === sortKey) setSortDir((d) => (d === 1 ? -1 : 1));
    else { setSortKey(key); setSortDir(key === "name" ? 1 : -1); }
  };

  const SortIcon = ({ k }: { k: SortKey }) =>
    k !== sortKey ? <ChevronsUpDown className="ml-1 inline h-3 w-3 opacity-40" />
      : sortDir === 1 ? <ArrowUp className="ml-1 inline h-3 w-3" />
      : <ArrowDown className="ml-1 inline h-3 w-3" />;

  return (
    <div className="space-y-3">
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

      {/* A register can run a dozen teaching days; the table scrolls inside its
          own box rather than pushing the page sideways on a phone. */}
      <div className="overflow-x-auto rounded-lg border bg-card shadow-register">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-muted text-left text-[11px] uppercase tracking-wider text-register-ink [&_th]:font-bold">
              <th
                className="sticky left-0 z-10 cursor-pointer bg-muted px-3 py-2.5"
                onClick={() => sortBy("name")}
              >
                Trainee <SortIcon k="name" />
              </th>
              <th className="px-2 py-2.5">Status</th>
              {sessions.map((s) => (
                <th key={s.id} className="px-1 py-2.5 text-center" title={s.title}>
                  {formatMonth(s.month, "en-GB").replace(" ", " ")}
                </th>
              ))}
              <th className="cursor-pointer px-2 py-2.5 text-right" onClick={() => sortBy("att")}>
                Att/Elig <SortIcon k="att" />
              </th>
              <th className="cursor-pointer px-2 py-2.5 text-right" onClick={() => sortBy("raw")}>
                Raw <SortIcon k="raw" />
              </th>
              <th className="cursor-pointer px-3 py-2.5 text-right" onClick={() => sortBy("adj")}>
                Adjusted <SortIcon k="adj" />
              </th>
            </tr>
          </thead>

          <tbody>
            {rows.map((row) => {
              const status = activeStatusType(
                blob, row.trainee.id, sessions[sessions.length - 1]?.month,
              );

              return (
                <tr key={row.trainee.id} className="border-b last:border-0 hover:bg-muted/40">
                  <td className="sticky left-0 z-10 bg-card px-3 py-1.5 font-medium">
                    <span className="block max-w-[180px] truncate">{row.trainee.name}</span>
                    {row.trainee.grade && (
                      <span className="text-[11px] font-normal text-muted-foreground">
                        {row.trainee.grade}
                      </span>
                    )}
                  </td>

                  <td className="px-2 py-1.5">
                    {status && (
                      // The specific status, and the dates behind it on hover:
                      // "Leave" for both maternity and out-of-programme would
                      // hide a difference that matters at an ARCP.
                      <Badge
                        variant="secondary"
                        className="whitespace-nowrap text-[10px]"
                        title={statusRangeText(status)}
                      >
                        {STATUS_SHORT[status.type]}
                      </Badge>
                    )}
                  </td>

                  {row.cells.map((cell) => {
                    const key = attendanceKey(row.trainee.id, cell.session.id);
                    const open = openCell?.key === key;
                    const grade = gradeAt(blob, row.trainee.id, cell.session.id);
                    // "Not eligible" is a derived fact, not a mark — it comes
                    // from a status window, so it is changed there, not here.
                    const editable = canEdit && cell.state !== "na";
                    const described =
                      `${row.trainee.name} — ${cell.session.title} ` +
                      `(${formatMonth(cell.session.month, "en-GB")}) · ${CELL_LABEL[cell.state]}` +
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
                          "h-7 w-7 rounded text-xs font-semibold transition-colors",
                          CELL[cell.state],
                          !editable && "cursor-default",
                        )}
                      >
                        {CELL_MARK[cell.state]}
                      </button>
                    );

                    return (
                      <td key={cell.session.id} className="px-1 py-1.5 text-center">
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

                  <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                    {row.attended}/{row.adjDenom > 0 ? row.adjDenom : row.eligible}
                  </td>
                  <td className={cn("px-2 py-1.5 text-right tabular-nums", pctClass(row.rawPct))}>
                    {row.rawPct}%
                  </td>
                  <td className={cn("px-3 py-1.5 text-right font-semibold tabular-nums", pctClass(row.adjPct))}>
                    {row.adjPct === null ? "—" : `${row.adjPct}%`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {rows.length === 0 && (
          <p className="px-3 py-8 text-center text-sm text-muted-foreground">
            {blob.trainees.length === 0
              ? "No trainees yet — add some under Trainees & sessions."
              : sessions.length === 0
                ? "No teaching days in this year yet."
                : "No trainees match."}
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        {(["present", "excused", "absent", "na"] as const).map((state) => (
          <span key={state} className="inline-flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className={cn(
                "inline-flex h-4 w-4 items-center justify-center rounded text-[10px] font-semibold",
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
      </p>
    </div>
  );
}
