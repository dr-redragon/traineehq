import { useEffect, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Loader2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { AccessPanel } from "@/components/register/AccessPanel";
import { AttendancePanel } from "@/components/register/AttendancePanel";
import { CheckInPanel } from "@/components/register/CheckInPanel";
import { PeoplePanel } from "@/components/register/PeoplePanel";
import { ReportPanel } from "@/components/register/ReportPanel";
import { useRegister } from "@/contexts/RegisterContext";
import { useRegisterDirectory } from "@/hooks/useRegisters";
import { useRegisterRequests } from "@/hooks/useRegisterAccess";
import { useRegisterStore } from "@/hooks/useRegisterStore";
import { useRegisterView, type RegisterTabId } from "@/hooks/useRegisterView";
import { useLiveAttendanceSync } from "@/hooks/useLiveAttendanceSync";
import { useCurrentUser } from "@/hooks/useUserRole";
import { ALL_YEARS } from "@/lib/register/months";

/**
 * A tab in the register's own idiom: a plain label that gains a clay rule when
 * it is the one you are on, rather than shadcn's pill in a tray. The rule is
 * three pixels of a colour used nowhere else on the page, so which panel is
 * open reads at a glance from across a lecture theatre.
 */
function RegisterTab({ value, children }: { value: RegisterTabId; children: ReactNode }) {
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
 * One register, behind four tabs grouped by how the work is done:
 *
 *   Attendance       the grid, its headline figures, and the report
 *   Teaching day     one day, start to finish: QR, check-in, live list,
 *                    certificates, absences and the feedback that came back
 *   People           the roster, teaching days, long-term status, excusals
 *   Access & settings  members, requests, the certificate badge, deleting
 *
 * The open tab, the academic year and the teaching day live in the address
 * bar, so a refresh, the Back button or a pasted link lands in the same place,
 * and the day picked on one tab is still picked on the next.
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

  const view = useRegisterView(blob.sessions);

  // Pending requests someone other than the asker can decide: the count the
  // Access & settings tab wears so they are noticed without going looking.
  const { data: user } = useCurrentUser();
  const { data: requests } = useRegisterRequests(entry?.i_am_member ? entry.id : undefined);
  const waiting = (requests ?? []).filter((r) => r.status === "pending" && r.user_id !== user?.id).length;

  // The register on screen is the one the switcher shows and remembers, however
  // it was reached — a link, a bookmark, the dashboard.
  const { setActiveRegisterSlug } = useRegister();
  useEffect(() => {
    if (entry?.i_am_member) setActiveRegisterSlug(entry.slug);
  }, [entry?.i_am_member, entry?.slug, setActiveRegisterSlug]);

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
      <div className="print:hidden">
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

      {storeLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <Tabs value={view.tab} onValueChange={(v) => view.setTab(v as RegisterTabId)}>
          {/* Scrolls rather than wrapping or shrinking on a phone, and sticky, so
              the masthead scrolls away but the way between panels does not.
              Bled to the edges so the rule under the row reaches them. */}
          <TabsList
            className={cn(
              "sticky top-0 z-20 -mx-4 flex h-auto w-full justify-start gap-1 overflow-x-auto",
              "rounded-none border-b border-border bg-background px-4 py-0 print:hidden",
            )}
          >
            <RegisterTab value="attendance">Attendance</RegisterTab>
            <RegisterTab value="day">Teaching day</RegisterTab>
            <RegisterTab value="people">People</RegisterTab>
            <RegisterTab value="access">
              Access &amp; settings
              {waiting > 0 && (
                <span
                  className="ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-register-clay px-1.5 text-[10px] font-bold text-white"
                  aria-label={`${waiting} waiting`}
                >
                  {waiting}
                </span>
              )}
            </RegisterTab>
          </TabsList>

          <TabsContent value="attendance" className="mt-4">
            {view.showReport ? (
              <div className="space-y-4">
                <Button variant="ghost" size="sm" className="-ml-2 text-xs print:hidden"
                  onClick={() => view.setShowReport(false)}>
                  <ArrowLeft className="mr-1.5 h-3.5 w-3.5" /> Back to attendance
                </Button>
                <ReportPanel
                  blob={blob}
                  registerName={`${entry.deanery_name} · ${entry.specialty_name}`}
                  initialYears={view.year === ALL_YEARS ? view.years : [view.year]}
                />
              </div>
            ) : (
              <AttendancePanel
                blob={blob}
                slug={entry.slug}
                view={view}
                onEdit={edit}
                onToggle={(traineeId, sessionId, nowPresent) =>
                  void pushMark(traineeId, sessionId, nowPresent)}
              />
            )}
          </TabsContent>

          <TabsContent value="day" className="mt-4">
            <CheckInPanel blob={blob} register={entry} view={view} onEdit={edit} />
          </TabsContent>

          <TabsContent value="people" className="mt-4">
            <PeoplePanel blob={blob} view={view} onEdit={edit} />
          </TabsContent>

          <TabsContent value="access" className="mt-4">
            <AccessPanel register={entry} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
