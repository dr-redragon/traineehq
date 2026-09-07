import { useMemo, useState } from "react";
import { FileText, Printer } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { availableAcademicYears, academicYearRange, formatMonth } from "@/lib/register/months";
import { buildReport, reportSummary, type ReportLayout } from "@/lib/register/report";
import type { RegisterBlob } from "@/lib/register/types";
import { cn } from "@/lib/utils";

const MARK: Record<string, string> = { present: "✓", excused: "E", absent: "·", na: "–" };

function pctClass(pct: number | null) {
  if (pct === null) return "text-muted-foreground";
  if (pct >= 80) return "text-emerald-600 dark:text-emerald-400";
  if (pct >= 60) return "text-amber-600 dark:text-amber-400";
  return "text-destructive";
}

export function ReportPanel({ blob, registerName }: { blob: RegisterBlob; registerName: string }) {
  const years = useMemo(() => availableAcademicYears(blob.sessions), [blob.sessions]);

  const [selected, setSelected] = useState<string[]>(years.slice(-1));
  const [layout, setLayout] = useState<ReportLayout>("per");
  const [includeCct, setIncludeCct] = useState(true);
  const [includeIdtOut, setIncludeIdtOut] = useState(true);
  const [hideNoEligible, setHideNoEligible] = useState(true);
  const [showSessions, setShowSessions] = useState(true);
  const [showRaw, setShowRaw] = useState(true);
  const [showAdj, setShowAdj] = useState(true);
  const [summaryOnly, setSummaryOnly] = useState(false);
  const [generated, setGenerated] = useState(false);

  const report = useMemo(
    () => buildReport(blob, { years: selected, layout, includeCct, includeIdtOut, hideNoEligible }),
    [blob, selected, layout, includeCct, includeIdtOut, hideNoEligible],
  );

  const summary = useMemo(() => reportSummary(report.overall), [report.overall]);

  const grid = showSessions && !summaryOnly;
  const raw = showRaw && !summaryOnly;
  const adj = showAdj && !summaryOnly;

  const toggleYear = (year: string) =>
    setSelected((s) => (s.includes(year) ? s.filter((y) => y !== year) : [...s, year]));

  if (!years.length) {
    return (
      <p className="text-sm text-muted-foreground">
        There is nothing to report on yet — add a teaching day first.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {/* Controls never print: a report that carries its own settings panel onto
          paper looks like a screenshot rather than a document. */}
      <Card className="print:hidden">
        <CardContent className="grid gap-6 p-4 sm:grid-cols-3">
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Academic year · Aug – Jul
            </p>
            <div className="flex flex-wrap gap-1.5">
              {years.map((year) => (
                <Button
                  key={year}
                  size="sm"
                  variant={selected.includes(year) ? "default" : "outline"}
                  className="h-7 px-2.5 text-xs"
                  title={academicYearRange(year)}
                  onClick={() => toggleYear(year)}
                >
                  {year}
                </Button>
              ))}
            </div>
            <div className="flex gap-3 pt-1 text-xs">
              <button className="text-primary hover:underline" onClick={() => setSelected(years)}>
                Select all
              </button>
              <button className="text-muted-foreground hover:underline" onClick={() => setSelected([])}>
                Clear
              </button>
            </div>

            {selected.length > 1 && (
              <div className="space-y-1.5 pt-2">
                <Label htmlFor="layout" className="text-xs">Layout</Label>
                <Select value={layout} onValueChange={(v) => setLayout(v as ReportLayout)}>
                  <SelectTrigger id="layout" className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="per">A table for each year</SelectItem>
                    <SelectItem value="both">Combined overview, then each year</SelectItem>
                    <SelectItem value="combined">One combined table</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Include trainees
            </p>
            {([
              ["Who have completed training (CCT)", includeCct, setIncludeCct],
              ["Who transferred out (IDT)", includeIdtOut, setIncludeIdtOut],
            ] as const).map(([label, value, set]) => (
              <Label key={label} className="flex cursor-pointer items-center gap-2 text-xs font-normal">
                <Checkbox checked={value} onCheckedChange={(v) => set(v === true)} />
                {label}
              </Label>
            ))}
            <Label className="flex cursor-pointer items-center gap-2 text-xs font-normal">
              <Checkbox
                checked={hideNoEligible}
                onCheckedChange={(v) => setHideNoEligible(v === true)}
              />
              Hide anyone with no eligible day
            </Label>
          </div>

          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Content
            </p>
            {([
              ["Per-session grid", showSessions, setShowSessions],
              ["Raw attendance %", showRaw, setShowRaw],
              ["Adjusted attendance %", showAdj, setShowAdj],
            ] as const).map(([label, value, set]) => (
              <Label
                key={label}
                className={cn(
                  "flex cursor-pointer items-center gap-2 text-xs font-normal",
                  summaryOnly && "opacity-50",
                )}
              >
                <Checkbox
                  checked={value && !summaryOnly}
                  disabled={summaryOnly}
                  onCheckedChange={(v) => set(v === true)}
                />
                {label}
              </Label>
            ))}
            <Label className="mt-2 flex cursor-pointer items-center gap-2 border-t pt-2 text-xs font-normal">
              <Checkbox checked={summaryOnly} onCheckedChange={(v) => setSummaryOnly(v === true)} />
              Summary only — totals, no grid or percentages
            </Label>
          </div>

          <div className="flex flex-wrap gap-2 sm:col-span-3">
            <Button
              size="sm"
              disabled={!selected.length}
              onClick={() => setGenerated(true)}
            >
              <FileText className="mr-1.5 h-4 w-4" /> Generate report
            </Button>
            {generated && (
              <Button size="sm" variant="outline" onClick={() => window.print()}>
                <Printer className="mr-1.5 h-4 w-4" /> Print or save as PDF
              </Button>
            )}
            {!selected.length && (
              <p className="self-center text-xs text-muted-foreground">
                Choose at least one academic year.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {generated && selected.length > 0 && (
        <div className="space-y-8">
          <header className="space-y-1 border-b pb-4">
            <h2 className="font-display text-lg font-semibold">{registerName}</h2>
            <p className="text-sm text-muted-foreground">
              Attendance report · {report.years.join(", ")} · generated{" "}
              {new Date().toLocaleDateString("en-GB", {
                day: "numeric", month: "long", year: "numeric",
              })}
            </p>
            <p className="text-xs text-muted-foreground">
              {includeCct ? "Including" : "Excluding"} trainees who have completed training ·{" "}
              {includeIdtOut ? "including" : "excluding"} those who transferred out ·{" "}
              {hideNoEligible ? "hiding" : "showing"} anyone with no eligible day
            </p>
          </header>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {([
              ["Trainees", String(summary.trainees)],
              ["Teaching days", String(report.sessions.length)],
              ["Cohort adjusted", summary.adjPct === null ? "—" : `${summary.adjPct}%`],
              ["At or above 80%", `${summary.atOrAbove80} of ${summary.trainees}`],
            ] as const).map(([label, value]) => (
              <div key={label}>
                <p className="text-2xl font-semibold tabular-nums">{value}</p>
                <p className="text-xs text-muted-foreground">{label}</p>
              </div>
            ))}
          </div>

          {report.sections.map((section) => (
            <section key={section.title} className="space-y-2 break-inside-avoid">
              <div>
                <h3 className="text-sm font-semibold">{section.title}</h3>
                <p className="text-xs text-muted-foreground">{section.subtitle}</p>
              </div>

              {section.rows.length === 0 ? (
                <p className="text-sm text-muted-foreground">No trainees to report for this period.</p>
              ) : (
                <div className="overflow-x-auto rounded-lg border print:overflow-visible print:rounded-none">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50 text-left">
                        <th className="px-3 py-2 font-medium">Trainee</th>
                        {grid && section.sessions.map((s) => (
                          <th key={s.id} className="px-1 py-2 text-center text-[11px] font-medium">
                            {formatMonth(s.month, "en-GB")}
                          </th>
                        ))}
                        <th className="px-2 py-2 text-right font-medium">Att/Elig</th>
                        {raw && <th className="px-2 py-2 text-right font-medium">Raw</th>}
                        {adj && <th className="px-3 py-2 text-right font-medium">Adjusted</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {section.rows.map((row) => (
                        <tr key={row.trainee.id} className="border-b last:border-0">
                          <td className="px-3 py-1.5 font-medium">{row.trainee.name}</td>
                          {grid && row.cells.map((cell) => (
                            <td key={cell.session.id} className="px-1 py-1.5 text-center text-xs">
                              {MARK[cell.state]}
                            </td>
                          ))}
                          <td className="px-2 py-1.5 text-right tabular-nums">
                            {row.attended}/{row.adjDenom > 0 ? row.adjDenom : row.eligible}
                          </td>
                          {raw && (
                            <td className={cn("px-2 py-1.5 text-right tabular-nums", pctClass(row.rawPct))}>
                              {row.rawPct}%
                            </td>
                          )}
                          {adj && (
                            <td className={cn("px-3 py-1.5 text-right font-semibold tabular-nums", pctClass(row.adjPct))}>
                              {row.adjPct === null ? "—" : `${row.adjPct}%`}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          ))}

          <footer className="space-y-1 border-t pt-4 text-[11px] text-muted-foreground">
            {grid && (
              <p>✓ attended · E excused · · missed · – not eligible (leave, pre-start or post-CCT)</p>
            )}
            <p>
              Adjusted attendance excludes months a trainee was not in programme, and excused
              absences, from the denominator. Raw counts every teaching day in the period.
            </p>
            {summary.below60 > 0 && (
              <p>
                <Badge variant="secondary" className="text-[10px]">
                  {summary.below60} below 60%
                </Badge>
              </p>
            )}
          </footer>
        </div>
      )}
    </div>
  );
}
