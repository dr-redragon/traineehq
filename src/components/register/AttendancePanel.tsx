import { useMemo, useState } from "react";
import { Download, FileText } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AttendanceGrid, AttendanceLegend, type GridOptions } from "@/components/register/AttendanceGrid";
import { SessionSidePanel } from "@/components/register/SessionSidePanel";
import { YearTabs } from "@/components/register/YearTabs";
import { latestGrade } from "@/lib/register/attendance";
import {
  academicYearOf, academicYearRange, ALL_YEARS, sessionsInYear, sessionWhen, todayIso,
} from "@/lib/register/months";
import { computeRows, type SortKey } from "@/lib/register/report";
import type { RegisterView } from "@/hooks/useRegisterView";
import type { RegisterEdit } from "@/hooks/useRegisterStore";
import type { RegisterBlob, RegisterDirectoryEntry } from "@/lib/register/types";
import { cn } from "@/lib/utils";

const CSV_STATE = {
  present: "Attended", excused: "Excused", na: "Not eligible", absent: "Missed",
  upcoming: "Not held yet",
} as const;

const csvCell = (value: string | number) => {
  const s = String(value ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/**
 * The attendance tab: headline figures, the grid, and the way into the report.
 *
 * "All years" is a table per academic year rather than one table as wide as
 * the register's history — which is what the classic register does, and what
 * keeps a register with several years of teaching days readable. All of the
 * tables answer to one search box, one filter and one sort.
 *
 * A teaching day's column header opens that day in a panel beside the grid:
 * its turnout, who missed it without a reason, and the actions that follow.
 */
export function AttendancePanel({
  blob, slug, register, view, onEdit, onToggle,
}: {
  blob: RegisterBlob;
  slug: string;
  /** The register itself, for the day panel's chaser and feedback. */
  register?: RegisterDirectoryEntry;
  view: RegisterView;
  onEdit: (edit: RegisterEdit) => void;
  onToggle: (traineeId: string, sessionId: string, nowPresent: boolean) => void;
}) {
  const [options, setOptions] = useState<GridOptions>({
    search: "", hideNotInProgramme: true, sortKey: "name", sortDir: 1,
  });

  const sortBy = (key: SortKey) => setOptions((o) => ({
    ...o,
    sortKey: key,
    sortDir: key === o.sortKey ? (o.sortDir === 1 ? -1 : 1) : key === "name" ? 1 : -1,
  }));

  const { years, year, sessions } = view;

  // The teaching day open beside the grid. Its own state rather than the
  // shared ?day=, which always names some day: the panel is opened by a click
  // and shut by one, and a day outside the year on screen closes it.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = sessions.find((s) => s.id === selectedId) ?? null;
  const toggleSession = (id: string) => setSelectedId((cur) => (cur === id ? null : id));
  const scopeLabel = year === ALL_YEARS ? "All years" : year;

  // One block per year under "All years", newest first; otherwise just the one.
  const blocks = year === ALL_YEARS
    ? [...years].reverse().map((y) => ({ label: y, sessions: sessionsInYear(blob.sessions, y) }))
    : [{ label: null as string | null, sessions }];

  const { rows, hidden } = useMemo(
    () => computeRows(blob, sessions, { ...options, asOf: todayIso() }),
    [blob, sessions, options],
  );

  const stats = useMemo(() => {
    const eligible = rows.filter((r) => r.eligible > 0);
    const mean = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
    return {
      meanAdjusted: mean(eligible.map((r) => r.adjPct ?? 0)),
      // Rows with nothing counted yet — every day still to come — have no raw figure.
      meanRaw: mean(rows.filter((r) => r.total > 0).map((r) => r.rawPct)),
      atFull: eligible.filter((r) => r.adjPct === 100).length,
      below60: eligible.filter((r) => r.adjPct !== null && r.adjPct < 60).length,
    };
  }, [rows]);

  const exportCsv = () => {
    const header = [
      "Trainee", "Grade", "Attended", "Eligible", "Excused",
      "Adjusted denominator", "Raw %", "Adjusted %",
      ...sessions.map((s) => `${sessionWhen(s)} — ${s.title}`),
    ];
    const lines = [header.map(csvCell).join(",")];
    for (const row of rows) {
      lines.push([
        row.trainee.name,
        latestGrade(blob, row.trainee.id, sessions),
        row.attended, row.eligible, row.excused, row.adjDenom,
        row.total ? row.rawPct : "", row.adjPct === null ? "" : row.adjPct,
        ...row.cells.map((c) => CSV_STATE[c.state]),
      ].map(csvCell).join(","));
    }
    const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${slug}-attendance-${scopeLabel.replace("/", "-")}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success("Attendance exported.");
  };

  const tiles: [string, string, boolean?][] = [
    [`Trainees · ${scopeLabel}`, String(rows.length)],
    ["Teaching days", String(sessions.length)],
    ["Mean adjusted", stats.meanAdjusted === null ? "—" : `${stats.meanAdjusted}%`],
    ["Mean raw", stats.meanRaw === null ? "—" : `${stats.meanRaw}%`],
    ["At 100% adjusted", String(stats.atFull)],
    ["Below 60%", String(stats.below60), true],
  ];

  return (
    <div className="space-y-4">
      <YearTabs years={years} value={year} onChange={view.setYear} />

      {/* The headline figures as one ruled strip: equal cells, a strong rule
          above and below, the numbers set large in the heading face. */}
      <div className="grid grid-cols-2 border-y-2 border-foreground sm:grid-cols-3 lg:grid-cols-6">
        {tiles.map(([label, value, accent]) => (
          <div
            key={label}
            className="space-y-1 border-b border-r border-border px-4 py-3 last:border-r-0 lg:border-b-0"
          >
            <p className={cn(
              "font-display text-[26px] font-extrabold leading-none tabular-nums",
              accent && Number(value) > 0 ? "text-primary" : "text-foreground",
            )}>
              {value}
            </p>
            <p className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Input
          value={options.search}
          onChange={(e) => setOptions((o) => ({ ...o, search: e.target.value }))}
          placeholder="Search trainees"
          className="h-8 w-full text-xs sm:w-56"
        />
        <Label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
          <Checkbox
            checked={options.hideNotInProgramme}
            onCheckedChange={(v) => setOptions((o) => ({ ...o, hideNotInProgramme: v === true }))}
          />
          Hide trainees not in programme
        </Label>
        {hidden > 0 && year !== ALL_YEARS && (
          <span className="text-xs text-muted-foreground">{hidden} hidden</span>
        )}
        <div className="flex w-full gap-2 sm:ml-auto sm:w-auto">
          <Button size="sm" variant="outline" className="flex-1 sm:flex-none" onClick={exportCsv}
            disabled={!sessions.length}>
            <Download className="mr-1.5 h-3.5 w-3.5" /> Export CSV
          </Button>
          <Button size="sm" className="flex-1 sm:flex-none" onClick={() => view.setShowReport(true)}>
            <FileText className="mr-1.5 h-3.5 w-3.5" /> Report
          </Button>
        </div>
      </div>

      <div className={cn("grid items-start gap-6", selected && "xl:grid-cols-[minmax(0,1fr)_300px]")}>
        <div className="min-w-0 space-y-4">
          {blocks.map((block) => (
            <section key={block.label ?? "one"} className="space-y-2">
              {block.label && (
                <div className="flex flex-wrap items-baseline gap-x-3 pt-2">
                  <h3 className="font-display text-lg font-extrabold">{block.label}</h3>
                  <span className="text-xs text-muted-foreground">
                    {academicYearRange(block.label)} · {block.sessions.length}{" "}
                    {block.sessions.length === 1 ? "teaching day" : "teaching days"}
                  </span>
                </div>
              )}
              <AttendanceGrid
                blob={blob}
                sessions={block.sessions}
                onEdit={onEdit}
                canEdit
                onToggle={onToggle}
                options={options}
                onSort={sortBy}
                bare
                selectedSessionId={selected?.id ?? null}
                onSelectSession={toggleSession}
              />
            </section>
          ))}

          <AttendanceLegend />
        </div>

        {selected && (
          // First on a narrow screen, so it opens right above the grid whose
          // header was pressed rather than somewhere below the legend.
          <div className="order-first xl:order-none">
            <SessionSidePanel
              blob={blob}
              session={selected}
              register={register}
              onOpenDay={() => view.openDay(selected.id, academicYearOf(selected.month))}
              onClose={() => setSelectedId(null)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
