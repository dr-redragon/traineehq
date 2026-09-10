import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  useDecideAccess, useInviteToRegister, useRegisterMembers, useRegisterPeople,
  useRegisterRequests, useRemoveMember, useSetMemberRole,
} from "@/hooks/classic/useRegisterAccess";
import { certificateFilename, renderCertificatePdf } from "@/lib/classic/certificate";
import {
  LOGO_MIME_TYPES, REGISTER_LOGO_BUCKET, registerLogoPath, registerLogoUrl, rejectLogo,
} from "@/lib/classic/logo";
import { useCurrentUser } from "@/hooks/useUserRole";
import type { RegisterDirectoryEntry, RegisterPerson, RegisterRole } from "@/lib/classic/types";

/**
 * A narrow, untyped view of the client for this register's own tables.
 *
 * src/integrations/supabase/types.ts is generated from the database and has not
 * been regenerated since the classic register's tables were added, so the typed
 * client refuses `classic_registers` outright. liveApi.ts solves the same
 * problem the same way. Regenerating the types removes the need for both.
 */
const untyped = supabase as unknown as {
  from: (table: string) => {
    update(values: Record<string, unknown>): {
      eq(column: string, value: unknown): PromiseLike<{ error: { message: string } | null }>;
    };
  };
};

function nameOf(person: RegisterPerson | undefined, fallback: string) {
  const name = [person?.first_name, person?.last_name].filter(Boolean).join(" ").trim();
  return name || person?.email || fallback;
}

/**
 * Users & access — who can open this register, and what it puts its name to.
 *
 * The invite is the same one the rest of TraineeHQ uses: an address is given,
 * the account is created if there is none, and the person is added to the
 * register outright. There is no token to click and no second consent, because
 * being added to a register you help run is not a thing anyone needs to agree to
 * twice — and every add records who made it.
 *
 * Roles are owner and editor only. An editor records attendance; an owner also
 * decides who else is here and what badge goes on the certificates. Trainees
 * never hold a membership at all — they reach check-in and feedback through the
 * session link, with no account.
 */
export function AccessPanel({ entry }: { entry: RegisterDirectoryEntry }) {
  const { data: user } = useCurrentUser();
  const { data: members, isLoading } = useRegisterMembers(entry.id);
  const { data: requests } = useRegisterRequests(entry.id);
  const { data: people } = useRegisterPeople(entry.id);

  const decide = useDecideAccess();
  const setRole = useSetMemberRole(entry.id);
  const remove = useRemoveMember(entry.id);
  const invite = useInviteToRegister(entry.id);

  const [email, setEmail] = useState("");
  const [role, setInviteRole] = useState<RegisterRole>("editor");
  const [search, setSearch] = useState("");

  const pending = (requests ?? []).filter((r) => r.status === "pending");

  const send = () => {
    const address = email.trim().toLowerCase();
    if (!address) return;
    invite.mutate({ email: address, role }, {
      onSuccess: () => { toast.success(`${address} now has access`); setEmail(""); },
      onError: (error: Error) => toast.error(error.message),
    });
  };

  const shown = (members ?? []).filter((m) => {
    const needle = search.trim().toLowerCase();
    if (!needle) return true;
    const person = people?.get(m.user_id);
    return nameOf(person, m.user_id).toLowerCase().includes(needle)
      || (person?.email ?? "").toLowerCase().includes(needle);
  });

  const owners = (members ?? []).filter((m) => m.role === "owner").length;

  return (
    <>
      <h2 className="panel-title">Users &amp; access</h2>
      <p className="panel-lede">
        Organiser accounts for this register: who can open it, and which of them
        can manage this list. Access here is a grant on this register alone — it
        has nothing to do with anyone's TraineeHQ role, so a trainee may be an
        editor and a TraineeHQ admin may have no access at all. Trainees never
        need an account; they use the QR code and the feedback link.
      </p>

      <div className="card pad">
        <label className="fld">Add an organiser</label>
        <div className="inline-form" style={{ gridTemplateColumns: "1.6fr 1.1fr auto" }}>
          <div>
            <input
              type="email"
              placeholder="name@example.nhs.uk"
              autoComplete="off"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") send(); }}
            />
          </div>
          <div>
            <select value={role} onChange={(e) => setInviteRole(e.target.value as RegisterRole)}>
              <option value="editor">Editor — records attendance</option>
              <option value="owner">Owner — also manages access</option>
            </select>
          </div>
          <div>
            <button type="button" className="btn primary" disabled={invite.isPending} onClick={send}>
              {invite.isPending ? "Adding…" : "Add"}
            </button>
          </div>
        </div>
        <p className="helper">
          If they have no TraineeHQ account yet, one is created and they are
          emailed a link to choose a password. If they already have one, they are
          simply added and told.
        </p>
      </div>

      {pending.length > 0 && (
        <>
          <div className="grouphead">Waiting on you</div>
          <div className="card">
            {pending.map((request) => {
              const person = people?.get(request.user_id);
              return (
                <div className="list-item" key={request.id}>
                  <div>
                    <div className="li-main">{nameOf(person, "Somebody")}</div>
                    <div className="li-sub">
                      {person?.email}{request.reason ? ` — “${request.reason}”` : ""}
                    </div>
                  </div>
                  <div className="row-actions">
                    <button
                      type="button"
                      className="btn primary sm"
                      onClick={() => decide.mutate({ requestId: request.id, approve: true })}
                    >
                      Admit
                    </button>
                    <button
                      type="button"
                      className="btn ghost sm"
                      onClick={() => decide.mutate({ requestId: request.id, approve: false })}
                    >
                      Refuse
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      <div className="att-head">
        <div className="row-actions">
          <input
            placeholder="Search accounts…"
            style={{ maxWidth: 260 }}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        {isLoading ? (
          <div className="empty">Loading the organisers…</div>
        ) : shown.length === 0 ? (
          <div className="empty">Nobody matches that.</div>
        ) : (
          shown.map((member) => {
            const person = people?.get(member.user_id);
            const isMe = member.user_id === user?.id;
            // The register must keep at least one owner, or nobody can ever
            // administer it again. The database refuses this too; hiding the
            // control means the refusal is never reached by accident.
            const lastOwner = member.role === "owner" && owners <= 1;
            return (
              <div className="list-item" key={member.user_id}>
                <div>
                  <div className="li-main">
                    {nameOf(person, member.user_id)}
                    {isMe && <span className="badge you" style={{ marginLeft: 8 }}>You</span>}
                  </div>
                  <div className="li-sub">{person?.email}</div>
                  <div className="pill-row">
                    <span className={`badge ${member.role === "owner" ? "admin" : "active"}`}>
                      {member.role === "owner" ? "Owner" : "Editor"}
                    </span>
                  </div>
                </div>
                <div className="row-actions">
                  {member.role === "editor" ? (
                    <button
                      type="button"
                      className="btn ghost sm"
                      onClick={() => setRole.mutate({ userId: member.user_id, role: "owner" })}
                    >
                      Make owner
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn ghost sm"
                      disabled={lastOwner}
                      title={lastOwner ? "The register's only owner cannot be demoted." : undefined}
                      onClick={() => setRole.mutate({ userId: member.user_id, role: "editor" })}
                    >
                      Make editor
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn ghost sm"
                    disabled={lastOwner}
                    title={lastOwner ? "The register's only owner cannot be removed." : undefined}
                    onClick={() => {
                      if (!window.confirm(
                        isMe
                          ? "Remove your own access to this register?"
                          : `Remove ${nameOf(person, "this person")}'s access?`)) return;
                      remove.mutate({ userId: member.user_id });
                    }}
                  >
                    {isMe ? "Leave" : "Remove"}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      <p className="helper" style={{ marginTop: 12 }}>
        Removing an organiser removes their access and nothing else. Trainees,
        attendance, excuses and feedback belong to the register, not to whoever
        recorded them.
      </p>

      <CertificateLogo entry={entry} />
    </>
  );
}

/**
 * The badge that goes on this register's certificates.
 *
 * The original carried one logo for one programme and read it from an
 * environment variable. With many registers that cannot work — the badge belongs
 * to the register — so it is stored against the register and uploaded by the
 * people who run it. Owners only: an editor records attendance, an owner decides
 * what the register puts its name to. Storage enforces the same rule.
 *
 * Going without is a real choice rather than an unfinished state, so it is
 * offered plainly and the certificate closes the space up rather than leaving a
 * hole where a badge would have been.
 */
function CertificateLogo({ entry }: { entry: RegisterDirectoryEntry }) {
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [previewing, setPreviewing] = useState(false);
  const logoUrl = registerLogoUrl(entry.certificate_logo_path);

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["classic-register-directory"] });

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const refusal = rejectLogo(file);
      if (refusal) throw new Error(refusal);

      const path = registerLogoPath(entry.id, file.name);
      const { error: uploadError } = await supabase.storage
        .from(REGISTER_LOGO_BUCKET)
        .upload(path, file, { contentType: file.type, upsert: false });
      if (uploadError) throw new Error(uploadError.message);

      const { error } = await untyped
        .from("classic_registers")
        .update({ certificate_logo_path: path })
        .eq("id", entry.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { toast.success("Badge updated"); refresh(); },
    onError: (error: Error) => toast.error(error.message),
  });

  const clear = useMutation({
    mutationFn: async () => {
      const { error } = await untyped
        .from("classic_registers")
        .update({ certificate_logo_path: null })
        .eq("id", entry.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { toast.success("Certificates will carry no badge"); refresh(); },
    onError: (error: Error) => toast.error(error.message),
  });

  const preview = async () => {
    setPreviewing(true);
    try {
      const details = {
        traineeName: "A. Trainee",
        registerName: entry.name,
        deaneryName: entry.deanery_name,
        sessionTitle: "Example teaching day",
        sessionDate: new Date().toISOString().slice(0, 10),
        logoUrl,
      };
      const bytes = await renderCertificatePdf(details);
      const url = URL.createObjectURL(
        new Blob([bytes as BlobPart], { type: "application/pdf" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = certificateFilename(details);
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setPreviewing(false);
    }
  };

  return (
    <>
      <div className="grouphead">Certificate badge</div>
      <div className="card pad">
        <div className="row-actions" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
          <div style={{ minWidth: 0 }}>
            <p className="helper" style={{ marginTop: 0 }}>
              A logo — a deanery crest, a society badge — printed at the head of
              every certificate this register issues. PNG or JPEG, up to 2 MB.
              Leave it unset and the certificate is laid out without one rather
              than leaving a gap.
            </p>
          </div>
          {logoUrl && (
            <img
              src={logoUrl}
              alt="This register's certificate badge"
              style={{
                height: 64, width: 64, objectFit: "contain", flexShrink: 0,
                border: "1px solid var(--line)", borderRadius: 9, background: "#fff", padding: 4,
              }}
            />
          )}
        </div>

        <div className="row-actions" style={{ marginTop: 12 }}>
          <input
            ref={fileInput}
            type="file"
            accept={LOGO_MIME_TYPES.join(",")}
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) upload.mutate(file);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            className="btn primary sm"
            disabled={upload.isPending}
            onClick={() => fileInput.current?.click()}
          >
            {upload.isPending ? "Uploading…" : logoUrl ? "Replace badge" : "Upload a badge"}
          </button>
          {logoUrl && (
            <button
              type="button"
              className="btn ghost sm"
              disabled={clear.isPending}
              onClick={() => clear.mutate()}
            >
              Use no badge
            </button>
          )}
          <button type="button" className="btn ghost sm" disabled={previewing} onClick={preview}>
            {previewing ? "Building…" : "Preview a certificate"}
          </button>
        </div>
      </div>
    </>
  );
}
