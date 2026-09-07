import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Loader2, Lock, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AttendanceGrid } from "@/components/register/AttendanceGrid";
import { ManagePanel } from "@/components/register/ManagePanel";
import { ReportPanel } from "@/components/register/ReportPanel";
import { YearTabs } from "@/components/register/YearTabs";
import { useRegisterDirectory } from "@/hooks/useRegisters";
import { useRegisterStore } from "@/hooks/useRegisterStore";
import {
  ALL_YEARS, availableAcademicYears, defaultAcademicYear, sessionsInYear, sessionsSorted,
} from "@/lib/register/months";

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
            <h1 className="font-display text-lg font-semibold">
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
          <h1 className="font-display text-xl font-semibold tracking-tight sm:text-2xl">
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
          <TabsList className="print:hidden">
            <TabsTrigger value="attendance" className="text-xs">Attendance</TabsTrigger>
            <TabsTrigger value="manage" className="text-xs">Trainees &amp; teaching days</TabsTrigger>
            <TabsTrigger value="reports" className="text-xs">Reports</TabsTrigger>
          </TabsList>

          <TabsContent value="attendance" className="mt-4 space-y-4">
            <YearTabs years={years} value={activeYear} onChange={setYear} />
            <AttendanceGrid blob={blob} sessions={sessions} onEdit={edit} canEdit />
          </TabsContent>

          <TabsContent value="manage" className="mt-4">
            <ManagePanel blob={blob} onEdit={edit} canEdit />
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
