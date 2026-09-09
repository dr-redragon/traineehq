import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { activeStatusType } from "@/lib/register/eligibility";
import { STATUS_SHORT, statusRangeText } from "@/lib/register/statusText";
import { computeRows, type SortKey } from "@/lib/register/report";
import { formatMonth } from "@/lib/register/months";
import { toggleAttendance } from "@/lib/register/blob";
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

/**
 * The original register's marks, kept: a filled moss square for a day attended,
 * clay for one excused, and an empty bordered cell for one missed. Missed is
 * deliberately the quiet one — a row of them reads as a gap in the grid, which
 * is the shape an organiser scans for, and it keeps a page of ordinary absence
 * from becoming a wall of red.
 */
const CELL: Record<string, string> = {
  present: "bg-primary text-primary-foreground hover:bg-primary/85",
  excused: "bg-register-clay-soft text-register-clay-ink hover:brightness-95",
  absent:  "border border-border bg-card text-muted-foreground/70 hover:border-primary",
  na:      "bg-muted text-muted-foreground/50",
};

const CELL_MARK: Record<string, string> = {
  present: "✓", excused: "E", absent: "·", na: "–",
};

export function AttendanceGrid({
  blob, sessions, onEdit, canEdit,
}: {
  blob: RegisterBlob;
  sessions: RegisterSession[];
  onEdit: (edit: RegisterEdit) => void;
  canEdit: boolean;
}) {
  const [search, setSearch] = useState("");
  const [hideNotInProgramme, setHideNotInProgramme] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<1 | -1>(1);

  const { rows, hidden } = useMemo(
    () => computeRows(blob, sessions, { search, hideNotInProgramme, sortKey, sortDir }),
    [blob, sessions, search, hideNotInProgramme, sortKey, sortDir],
  );

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

                  {row.cells.map((cell) => (
                    <td key={cell.session.id} className="px-1 py-1.5 text-center">
                      <button
                        type="button"
                        // "Not eligible" is a derived fact, not a mark — it comes
                        // from a status window, so it is changed there, not here.
                        disabled={!canEdit || cell.state === "na"}
                        onClick={() =>
                          onEdit((b) => toggleAttendance(b, row.trainee.id, cell.session.id))
                        }
                        title={`${row.trainee.name} — ${cell.session.title}`}
                        className={cn(
                          "h-7 w-7 rounded text-xs font-semibold transition-colors",
                          CELL[cell.state],
                          (!canEdit || cell.state === "na") && "cursor-default",
                        )}
                      >
                        {CELL_MARK[cell.state]}
                      </button>
                    </td>
                  ))}

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
        {([
          ["present", "Attended"],
          ["excused", "Excused"],
          ["absent", "Missed"],
          ["na", "Not eligible (leave, pre-start or post-CCT)"],
        ] as const).map(([state, label]) => (
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
            {label}
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
