import { useState } from "react";
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
 * "Users & access" is owners-only, exactly as the original hid its admin tab
 * from organisers who were not administrators.
 */
export default function ClassicRegisterDetail() {
  const { slug } = useParams<{ slug: string }>();
  const { data: directory, isLoading: directoryLoading } = useRegisterDirectory();
  const entry = directory?.find((r) => r.slug === slug);
  const store = useRegisterStore(entry?.id);
  const [tab, setTab] = useState("dash");

  if (directoryLoading) {
    return (
      <ClassicShell subtitle="Teaching attendance">
        <div className="card"><div className="empty">Loading the register…</div></div>
      </ClassicShell>
    );
  }

  // Either the register does not exist, or it does and this person holds no
  // membership on it. The two are answered the same way on purpose: the
  // directory lists names, so "no access" is the honest message either way.
  if (!entry || !entry.i_am_member) {
    return (
      <ClassicShell subtitle="Teaching attendance">
        <h2 className="panel-title">No access to this register</h2>
        <p className="panel-lede">
          You are not one of its organisers. Ask for access from the register
          directory, and somebody who runs it can add you.
        </p>
        <Link className="btn primary" to="/classic-registers">Back to the directory</Link>
      </ClassicShell>
    );
  }

  const tabs: ClassicTab[] = [
    { id: "dash", label: "Attendance" },
    { id: "checkin", label: "Check-in / QR" },
    { id: "excused", label: "Excused absences" },
    { id: "status", label: "Long-term status" },
    { id: "manage", label: "Trainees & sessions" },
    ...(entry.i_am_owner ? [{ id: "admin", label: "Users & access" }] : []),
  ];

  const count = store.blob.trainees.length;
  const note = store.isLoading
    ? "Loading…"
    : `${count} ${count === 1 ? "trainee" : "trainees"} · ${store.blob.sessions.length} sessions`;

  return (
    <ClassicShell
      subtitle={entry.name}
      note={note}
      tabs={tabs}
      activeTab={tab}
      onTabChange={setTab}
    >
      {store.error ? (
        <div className="notice bad">{store.error.message}</div>
      ) : (
        <>
          <section className={"panel" + (tab === "dash" ? " active" : "")}>
            {tab === "dash" && <AttendancePanel entry={entry} store={store} />}
          </section>
          <section className={"panel" + (tab === "checkin" ? " active" : "")}>
            {tab === "checkin" && <CheckinPanel entry={entry} store={store} />}
          </section>
          <section className={"panel" + (tab === "excused" ? " active" : "")}>
            {tab === "excused" && <ExcusedPanel store={store} />}
          </section>
          <section className={"panel" + (tab === "status" ? " active" : "")}>
            {tab === "status" && <StatusPanel store={store} />}
          </section>
          <section className={"panel" + (tab === "manage" ? " active" : "")}>
            {tab === "manage" && <ManagePanel store={store} />}
          </section>
          {entry.i_am_owner && (
            <section className={"panel" + (tab === "admin" ? " active" : "")}>
              {tab === "admin" && <AccessPanel entry={entry} />}
            </section>
          )}
        </>
      )}
    </ClassicShell>
  );
}
