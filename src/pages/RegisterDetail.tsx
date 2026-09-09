import { useMemo, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Loader2, Lock, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { AttendanceGrid } from "@/components/register/AttendanceGrid";
import { ManagePanel } from "@/components/register/ManagePanel";
import { ReportPanel } from "@/components/register/ReportPanel";
import { StatusPanel } from "@/components/register/StatusPanel";
import { ExcusalsPanel } from "@/components/register/ExcusalsPanel";
import { CheckInPanel } from "@/components/register/CheckInPanel";
import { FeedbackPanel } from "@/components/register/FeedbackPanel";
import { YearTabs } from "@/components/register/YearTabs";
import { useRegisterDirectory } from "@/hooks/useRegisters";
import { useRegisterStore } from "@/hooks/useRegisterStore";
import { useLiveAttendanceSync } from "@/hooks/useLiveAttendanceSync";
import {
  ALL_YEARS, availableAcademicYears, defaultAcademicYear, sessionsInYear, sessionsSorted,
} from "@/lib/register/months";

/**
 * A tab in the register's own idiom: a plain label that gains a clay rule when
 * it is the one you are on, rather than shadcn's pill in a tray. The rule is
 * three pixels of a colour used nowhere else on the page, so which panel is
 * open reads at a glance from across a lecture theatre.
 */
function RegisterTab({ value, children }: { value: string; children: ReactNode }) {
  return (
    <TabsTrigger
      value={value}
      className={cn(
        "rounded-none border-b-[3px] border-transparent bg-transparent px-3 py-3 text-[13px]",
        "font-semibold text-muted-foreground shadow-none transition-colors hover:text-foreground",
        "data-[state=active]:border-register-clay data-[state=active]:bg-transparent",
        "data-[state=active]:text-register-ink data-[state=active]:shadow-none",
      )}
    >
      {children}
    </TabsTrigger>
  );
}

/**
 * One register.
 *
 * The membership gate here is a courtesy, not the boundary: row-level security
 * is what withholds the data, and a non-member who edits the URL would get
 * nothing back from the database even if this page rendered for them.
 */
export default function RegisterDetail() {
  const { slug } = useParams<{ slug: string }>();
  const { data: directory, isLoading: directoryLoading } = useRegisterDirectory();
  const entry = directory?.find((r) => r.slug === slug);

  const { blob, isLoading: storeLoading, edit, isSaving } = useRegisterStore(
    entry?.i_am_member ? entry.id : undefined,
  );

  // A tick in the grid is a check-in, so it has to reach the published teaching
  // day as well as the blob — otherwise that person is invisible to the live
  // sign-in list, the feedback form and their own certificate.
  const { pushMark } = useLiveAttendanceSync(
    entry?.i_am_member ? entry.id : undefined, blob,
  );

  const years = useMemo(() => availableAcademicYears(blob.sessions), [blob.sessions]);
  const [year, setYear] = useState<string | null>(null);
  const activeYear = year ?? defaultAcademicYear(blob.sessions);

  const sessions = useMemo(
    () => (activeYear === ALL_YEARS
      ? sessionsSorted(blob.sessions)
      : sessionsInYear(blob.sessions, activeYear)),
    [blob.sessions, activeYear],
  );

  if (directoryLoading) {
    return <div className="space-y-3"><Skeleton className="h-8 w-64" /><Skeleton className="h-64 w-full" /></div>;
  }

  if (!entry) {
    return (
      <Card>
        <CardContent className="space-y-4 py-10 text-center">
          <p className="text-sm text-muted-foreground">There is no register at this address.</p>
          <Button asChild variant="outline" size="sm">
            <Link to="/registers"><ArrowLeft className="mr-1.5 h-3.5 w-3.5" /> All registers</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!entry.i_am_member) {
    return (
      <Card>
        <CardContent className="space-y-4 py-10 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <Lock className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="space-y-1.5">
            <h1 className="font-display text-lg font-bold">
              You do not have access to this register
            </h1>
            <p className="mx-auto max-w-sm text-sm text-muted-foreground">
              {entry.deanery_name} · {entry.specialty_name}. Access is granted per person: ask
              for it from the register list, and anyone who already belongs can approve it.
            </p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link to="/registers"><ArrowLeft className="mr-1.5 h-3.5 w-3.5" /> All registers</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3 print:hidden">
        <div className="min-w-0">
          <h1 className="font-display text-xl font-bold tracking-tight sm:text-2xl">
            {entry.specialty_name}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {entry.deanery_name} · {entry.member_count}{" "}
            {entry.member_count === 1 ? "member" : "members"}
            {isSaving && (
              <span className="ml-2 inline-flex items-center gap-1 text-xs">
                <Loader2 className="h-3 w-3 animate-spin" /> Saving…
              </span>
            )}
          </p>
        </div>
        <Button asChild variant="outline" size="sm" className="w-full sm:w-auto">
          <Link to={`/registers/${entry.slug}/access`}>
            <Users className="mr-1.5 h-3.5 w-3.5" /> Access
          </Link>
        </Button>
      </div>

      {storeLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <Tabs defaultValue="attendance">
          {/* Scrolls rather than wrapping or shrinking on a phone: five tabs
              squeezed into 375px are unreadable and unhittable. Sticky, so the
              masthead scrolls away but the way between panels does not — a
              register with thirty trainees on it is a long page.

              Bled to the edges with a negative margin so the rule under the
              row reaches them, the way the register's own nav bar does. */}
          <TabsList
            className={cn(
              "sticky top-0 z-20 -mx-4 flex h-auto w-full justify-start gap-1 overflow-x-auto",
              "rounded-none border-b border-border bg-background px-4 py-0 print:hidden",
            )}
          >
            <RegisterTab value="attendance">Attendance</RegisterTab>
            <RegisterTab value="manage">Trainees &amp; days</RegisterTab>
            <RegisterTab value="status">Long-term status</RegisterTab>
            <RegisterTab value="excused">Excused absences</RegisterTab>
            <RegisterTab value="checkin">Check-in / QR</RegisterTab>
            <RegisterTab value="feedback">Feedback</RegisterTab>
            <RegisterTab value="reports">Reports</RegisterTab>
          </TabsList>

          <TabsContent value="attendance" className="mt-4 space-y-4">
            <YearTabs years={years} value={activeYear} onChange={setYear} />
            <AttendanceGrid
              blob={blob}
              sessions={sessions}
              onEdit={edit}
              canEdit
              onToggle={(traineeId, sessionId, nowPresent) =>
                void pushMark(traineeId, sessionId, nowPresent)}
            />
          </TabsContent>

          <TabsContent value="manage" className="mt-4">
            <ManagePanel blob={blob} onEdit={edit} canEdit />
          </TabsContent>

          <TabsContent value="status" className="mt-4">
            <StatusPanel blob={blob} onEdit={edit} canEdit />
          </TabsContent>

          <TabsContent value="excused" className="mt-4">
            <ExcusalsPanel blob={blob} onEdit={edit} canEdit />
          </TabsContent>

          <TabsContent value="checkin" className="mt-4">
            <CheckInPanel blob={blob} registerId={entry.id} onEdit={edit} />
          </TabsContent>

          <TabsContent value="feedback" className="mt-4">
            <FeedbackPanel registerId={entry.id} />
          </TabsContent>

          <TabsContent value="reports" className="mt-4">
            <ReportPanel
              blob={blob}
              registerName={`${entry.deanery_name} · ${entry.specialty_name}`}
            />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
