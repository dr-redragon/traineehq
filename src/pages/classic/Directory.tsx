import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { ClassicShell } from "@/components/classic/ClassicShell";
import {
  useCreatableDeaneries, useCreatableSpecialties, useCreateRegister,
  useGroupedRegisters, useRequestRegisterAccess,
} from "@/hooks/classic/useRegisters";
import { useUserRole } from "@/hooks/useUserRole";
import type { RegisterDirectoryEntry } from "@/lib/classic/types";

/**
 * The classic register's front door: the registers you hold, the ones you have
 * asked for, and the ones you could ask for.
 *
 * The standalone ENT register had no such page — it was one register, and
 * signing in put you straight into it. This is the one screen the copy has to
 * invent, because "different specialties in each deanery have their own
 * register" is the whole reason the register is multi-tenant. It is built from
 * the original's own vocabulary — `.card`, `.list-item`, `.grouphead`,
 * `.btn` — so it reads as part of the same application rather than as a
 * TraineeHQ page bolted onto the front.
 */

function RegisterRow({
  entry,
  action,
}: {
  entry: RegisterDirectoryEntry;
  action: React.ReactNode;
}) {
  return (
    <div className="list-item">
      <div>
        <div className="li-main">{entry.name}</div>
        <div className="li-sub">
          {entry.deanery_name} · {entry.specialty_name} ·{" "}
          {entry.member_count} {entry.member_count === 1 ? "organiser" : "organisers"}
        </div>
      </div>
      <div className="row-actions">{action}</div>
    </div>
  );
}

export default function ClassicDirectory() {
  const { grouped, isLoading } = useGroupedRegisters();
  const { data: role } = useUserRole();
  const requestAccess = useRequestRegisterAccess();
  const createRegister = useCreateRegister();

  const [creating, setCreating] = useState(false);
  const [deaneryId, setDeaneryId] = useState("");
  const [specialtyId, setSpecialtyId] = useState("");

  const { data: deaneries } = useCreatableDeaneries(creating);
  const { data: specialties } = useCreatableSpecialties(deaneryId || undefined);

  // Held by TraineeHQ admins, and by anyone who already runs a register — the
  // same rule can_create_classic_register() enforces in the database. Shown or
  // hidden here only so the form is not offered to someone it would refuse.
  const canCreate =
    role === "admin" || role === "super_admin" || grouped.mine.length > 0;

  const ask = (entry: RegisterDirectoryEntry) => {
    requestAccess.mutate(
      { registerId: entry.id },
      {
        onSuccess: () => toast.success(`Asked to join ${entry.name}`),
        onError: (error: Error) => toast.error(error.message),
      },
    );
  };

  const create = () => {
    if (!deaneryId || !specialtyId) return;
    createRegister.mutate(
      { deaneryId, specialtyId },
      {
        onSuccess: () => {
          toast.success("Register created — you are its owner");
          setCreating(false);
          setDeaneryId("");
          setSpecialtyId("");
        },
        onError: (error: Error) => toast.error(error.message),
      },
    );
  };

  return (
    <ClassicShell subtitle="Teaching attendance" homeHref="/classic-registers">
      <h2 className="panel-title">Teaching registers</h2>
      <p className="panel-lede">
        Every specialty in every deanery keeps its own register. Open one you
        already run, or ask the people who run it for access — organisers are
        added by name, and trainees never need an account.
      </p>

      {isLoading ? (
        <div className="card"><div className="empty">Loading the directory…</div></div>
      ) : (
        <>
          <div className="grouphead">Your registers</div>
          <div className="card">
            {grouped.mine.length === 0 ? (
              <div className="empty">
                You do not hold a register yet. Ask for one below, or create one
                if this is a specialty nobody has started.
              </div>
            ) : (
              grouped.mine.map((entry) => (
                <RegisterRow
                  key={entry.id}
                  entry={entry}
                  action={
                    <Link className="btn primary sm" to={`/classic-registers/${entry.slug}`}>
                      Open
                    </Link>
                  }
                />
              ))
            )}
          </div>

          {grouped.awaiting.length > 0 && (
            <>
              <div className="grouphead">Waiting on a decision</div>
              <div className="card">
                {grouped.awaiting.map((entry) => (
                  <RegisterRow
                    key={entry.id}
                    entry={entry}
                    action={<span className="badge pending">Requested</span>}
                  />
                ))}
              </div>
            </>
          )}

          <div className="grouphead">Other registers</div>
          <div className="card">
            {grouped.available.length === 0 ? (
              <div className="empty">There are no other registers to ask about.</div>
            ) : (
              grouped.available.map((entry) => (
                <RegisterRow
                  key={entry.id}
                  entry={entry}
                  action={
                    <button
                      type="button"
                      className="btn ghost sm"
                      disabled={requestAccess.isPending}
                      onClick={() => ask(entry)}
                    >
                      Ask for access
                    </button>
                  }
                />
              ))
            )}
          </div>
        </>
      )}

      {canCreate && (
        <div className="card pad" style={{ marginTop: 22 }}>
          {!creating ? (
            <div className="row-actions" style={{ justifyContent: "space-between" }}>
              <div>
                <strong>Start a new register</strong>
                <p className="helper" style={{ marginTop: 2 }}>
                  One register per specialty per deanery. Creating it makes you
                  its owner.
                </p>
              </div>
              <button type="button" className="btn primary sm" onClick={() => setCreating(true)}>
                New register
              </button>
            </div>
          ) : (
            <>
              <label className="fld">Start a new register</label>
              <div className="inline-form" style={{ gridTemplateColumns: "1fr 1fr auto" }}>
                <div>
                  <select
                    value={deaneryId}
                    onChange={(e) => { setDeaneryId(e.target.value); setSpecialtyId(""); }}
                  >
                    <option value="">Deanery…</option>
                    {(deaneries ?? []).map((d) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <select
                    value={specialtyId}
                    disabled={!deaneryId}
                    onChange={(e) => setSpecialtyId(e.target.value)}
                  >
                    <option value="">Specialty…</option>
                    {(specialties ?? []).map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
                <div className="row-actions">
                  <button
                    type="button"
                    className="btn primary"
                    disabled={!deaneryId || !specialtyId || createRegister.isPending}
                    onClick={create}
                  >
                    Create
                  </button>
                  <button type="button" className="btn ghost" onClick={() => setCreating(false)}>
                    Cancel
                  </button>
                </div>
              </div>
              <p className="helper">
                A specialty already carrying a register in that deanery is not
                offered — ask that register's owners for access instead.
              </p>
            </>
          )}
        </div>
      )}
    </ClassicShell>
  );
}
