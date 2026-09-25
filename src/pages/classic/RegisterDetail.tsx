import { Link, useParams } from "react-router-dom";
import { ClassicShell, type ClassicTab } from "@/components/classic/ClassicShell";
import { AttendancePanel } from "@/components/classic/AttendancePanel";
import { CheckinPanel } from "@/components/classic/CheckinPanel";
import { ExcusedPanel } from "@/components/classic/ExcusedPanel";
import { StatusPanel } from "@/components/classic/StatusPanel";
import { ManagePanel } from "@/components/classic/ManagePanel";
import { AccessPanel } from "@/components/classic/AccessPanel";
import { useRegisterDirectory } from "@/hooks/classic/useRegisters";
import { useRegisterStore } from "@/hooks/classic/useRegisterStore";
import { useClassicRegisterView } from "@/hooks/classic/useRegisterView";
import { useRegisterRequests } from "@/hooks/classic/useRegisterAccess";
import { useCurrentUser } from "@/hooks/useUserRole";

/**
 * One register, behind the six tabs the standalone ENT register had.
 *
 * The tab set, its order and its wording are the original's:
 *
 *   Attendance · Check-in / QR · Excused absences · Long-term status ·
 *   Trainees & sessions · Users & access
 *
 * They are deliberately NOT the tabs the live TraineeHQ register uses, which
 * splits feedback and reports into tabs of their own and calls the fifth
 * "Trainees & days". Comparing the two is the point of having both, so this one
 * keeps the shape of the register it was copied from — feedback and reporting
 * live where they lived, inside Check-in and Attendance respectively.
 *
 * "Users & access" is open to every organiser, as the live register's Access
 * tab is: any of them can admit a request or add an editor, which the database
 * has always allowed. What stays owners-only inside it — roles, removing other
 * people, the certificate badge, deleting the register — is hidden from editors.
 *
 * The open tab, the academic year and the teaching day are kept in the
 * address bar (see useClassicRegisterView), so a refresh or a shared link
 * lands in the same place and the chosen day follows from tab to tab.
 */
export default function ClassicRegisterDetail() {
  const { slug } = useParams<{ slug: string }>();
  const { data: directory, isLoading: directoryLoading } = useRegisterDirectory();
  const entry = directory?.find((r) => r.slug === slug);
  const store = useRegisterStore(entry?.id);
  const view = useClassicRegisterView(store.blob.sessions);

  // Requests somebody other than the asker can decide, counted on the tab so
  // they are noticed without going looking.
  const { data: user } = useCurrentUser();
  const { data: requests } = useRegisterRequests(entry?.i_am_member ? entry.id : undefined);
  const waiting = (requests ?? [])
    .filter((r) => r.status === "pending" && r.user_id !== user?.id).length;
  const tab = view.tab;

  if (directoryLoading) {
    return (
      <ClassicShell subtitle="Teaching attendance" registers={directory} currentSlug={slug}>
        <div className="card"><div className="empty">Loading the register…</div></div>
      </ClassicShell>
    );
  }

  // Either the register does not exist, or it does and this person holds no
  // membership on it. The two are answered the same way on purpose: the
  // directory lists names, so "no access" is the honest message either way.
  if (!entry || !entry.i_am_member) {
    return (
      <ClassicShell subtitle="Teaching attendance" registers={directory}>
        <h2 className="panel-title">No access to this register</h2>
        <p className="panel-lede">
          You are not one of its organisers. Ask for access from the register
          directory — any of its organisers can let you in.
        </p>
        <Link className="btn primary" to="/classic-registers">Back to the directory</Link>
      </ClassicShell>
    );
  }

  const tabs: ClassicTab[] = [
    { id: "attendance", label: "Attendance" },
    { id: "checkin", label: "Check-in / QR" },
    { id: "excused", label: "Excused absences" },
    { id: "status", label: "Long-term status" },
    { id: "manage", label: "Trainees & sessions" },
    { id: "access", label: waiting ? `Users & access (${waiting})` : "Users & access" },
  ];

  const count = store.blob.trainees.length;
  const note = store.isLoading
    ? "Loading…"
    : `${count} ${count === 1 ? "trainee" : "trainees"} · ${store.blob.sessions.length} sessions`;

  return (
    <ClassicShell
      subtitle={entry.name}
      note={note}
      registers={directory}
      currentSlug={entry.slug}
      tabs={tabs}
      activeTab={tab}
      onTabChange={view.setTab}
    >
      {store.error ? (
        <div className="notice bad">{store.error.message}</div>
      ) : (
        <>
          <section className={"panel" + (tab === "attendance" ? " active" : "")}>
            {tab === "attendance" && <AttendancePanel entry={entry} store={store} view={view} />}
          </section>
          <section className={"panel" + (tab === "checkin" ? " active" : "")}>
            {tab === "checkin" && <CheckinPanel entry={entry} store={store} view={view} />}
          </section>
          <section className={"panel" + (tab === "excused" ? " active" : "")}>
            {tab === "excused" && <ExcusedPanel store={store} view={view} />}
          </section>
          <section className={"panel" + (tab === "status" ? " active" : "")}>
            {tab === "status" && <StatusPanel store={store} />}
          </section>
          <section className={"panel" + (tab === "manage" ? " active" : "")}>
            {tab === "manage" && <ManagePanel store={store} entry={entry} />}
          </section>
          <section className={"panel" + (tab === "access" ? " active" : "")}>
            {tab === "access" && <AccessPanel entry={entry} />}
          </section>
        </>
      )}
    </ClassicShell>
  );
}
