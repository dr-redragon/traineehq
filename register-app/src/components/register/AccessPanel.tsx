import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Archive, Copy, Crown, Mail, UserMinus, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useArchiveRegister, useInviteToRegister, useRegisterInvites, useRegisterMembers,
  useRegisterPeople, useRemoveMember, useRevokeInvite, useSetMemberRole,
} from "@/hooks/useRegisterAccess";
import { CertificateLogoPanel } from "@/components/register/CertificateLogoPanel";
import { RegisterHistoryPanel } from "@/components/register/RegisterHistoryPanel";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { purgeCountdown } from "@/lib/register/archive";
import { inviteLink } from "@/lib/register/api";
import { CertificateDesignPanel } from "@/components/register/CertificateDesignPanel";
import { ListsPanel } from "@/components/register/ListsPanel";
import type { RegisterEdit } from "@/hooks/useRegisterStore";
import type { RegisterBlob, RegisterDirectoryEntry, RegisterPerson, RegisterRole } from "@/lib/register/types";

/** The three levels of access, most to least. */
const ROLES: { id: RegisterRole; label: string; can: string }[] = [
  { id: "owner", label: "Owner", can: "Everything, including who has access and deleting the register" },
  { id: "editor", label: "Editor — read and write", can: "Record attendance, run check-in, send certificates" },
  { id: "viewer", label: "Viewer — read only", can: "See and export everything, change nothing" },
];
const roleLabel = (role: RegisterRole) =>
  role === "owner" ? "Owner" : role === "viewer" ? "Viewer" : "Editor";

function nameOf(person: RegisterPerson | undefined, fallback: string) {
  const name = [person?.first_name, person?.last_name].filter(Boolean).join(" ").trim();
  return name || person?.email || fallback;
}

async function copy(text: string, done: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(done);
  } catch {
    // Clipboard access is refused outside a secure context or without focus.
    toast.message("Copy this link", { description: text, duration: 20000 });
  }
}

/**
 * The register's Access & settings tab: who can use it, who has been invited,
 * the badge its certificates carry, and deleting it.
 *
 * Access is per person. Only an owner invites somebody, changes roles, removes
 * other people, sets the badge or deletes the register; an editor records
 * attendance. The register holds absence and leave records, so who may read it
 * is the owners' call. The server enforces the same rule — these controls only
 * mirror it.
 *
 * Collaborators never need a subscription of their own: a regular register is
 * covered by its owner's.
 */
export function AccessPanel({
  register: entry, blob, onEdit, canEdit,
}: {
  register: RegisterDirectoryEntry;
  blob: RegisterBlob;
  onEdit: (edit: RegisterEdit) => void;
  /** Editors and owners, on a register that is not read-only. */
  canEdit: boolean;
}) {
  const { data: user } = useCurrentUser();

  const { data: members, isLoading: membersLoading } = useRegisterMembers(entry.id);
  const { data: people } = useRegisterPeople(entry.id);
  const iAmOwner = entry.i_am_owner;
  const { data: invites } = useRegisterInvites(iAmOwner ? entry.id : undefined);

  const setRole = useSetMemberRole(entry.id);
  const remove = useRemoveMember(entry.id);
  const invite = useInviteToRegister(entry.id);
  const revoke = useRevokeInvite(entry.id);

  const [email, setEmail] = useState("");
  const [role, setRoleChoice] = useState<RegisterRole>("editor");

  const ownerCount = (members ?? []).filter((m) => m.role === "owner").length;
  const pending = (invites ?? []).filter((i) => !i.accepted_at);

  const onInvite = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    invite.mutate(
      { email, role },
      {
        onSuccess: (result) => {
          setEmail("");
          if (result.email_sent) {
            toast.success(`Invitation emailed to ${result.email}.`);
          } else {
            // No mail provider configured, or the send failed: the link still
            // works, so hand it over rather than report a failure.
            void copy(inviteLink(result.token),
              `Invitation created — the link is copied. Send it to ${result.email} yourself.`);
          }
        },
        onError: (err: Error) => toast.error(err.message),
      },
    );
  };

  if (membersLoading) return <Skeleton className="h-48 w-full" />;

  return (
    <div className="space-y-10">
      <div>
        <h2 className="font-display text-lg font-bold tracking-tight">Who can use this register</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Access is given per person, at one of three levels: owner, editor (read and
          write) or viewer (read only). Only an owner can invite someone, change roles or
          remove people. Collaborators do not need a subscription of their own.
        </p>
      </div>

      {/* --------------------------------------------------------- members -- */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Members</h2>
        <div className="space-y-2">
          {(members ?? []).map((m) => {
            const person = people?.get(m.user_id);
            const isMe = m.user_id === user?.id;
            const lastOwner = m.role === "owner" && ownerCount <= 1;

            return (
              <Card key={m.user_id}>
                <CardContent className="flex flex-wrap items-center gap-x-3 gap-y-2 p-4">
                  <div className="min-w-0 basis-full sm:basis-auto">
                    <p className="truncate font-medium">
                      {nameOf(person, "Unknown")}
                      {isMe && <span className="ml-1.5 text-xs text-muted-foreground">(you)</span>}
                    </p>
                    {person?.email && (
                      <p className="truncate text-xs text-muted-foreground">{person.email}</p>
                    )}
                  </div>

                  <div className="hidden flex-1 sm:block" />

                  {/* An owner changes anybody's role from here, except the last
                      owner's: a register with no owner could never have its
                      access managed again. Everyone else sees a label. */}
                  {iAmOwner && !lastOwner ? (
                    <Select
                      value={m.role}
                      onValueChange={(next) =>
                        setRole.mutate(
                          { userId: m.user_id, role: next as RegisterRole },
                          {
                            onSuccess: () => toast.success("Role updated."),
                            onError: (e: Error) => toast.error(e.message),
                          },
                        )
                      }
                      disabled={setRole.isPending}
                    >
                      <SelectTrigger className="h-9 w-[170px]" aria-label={`Role for ${nameOf(person, "this member")}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ROLES.map((r) => <SelectItem key={r.id} value={r.id}>{r.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  ) : m.role === "owner" ? (
                    <Badge className="gap-1"><Crown className="h-3 w-3" /> Owner</Badge>
                  ) : (
                    <Badge variant="secondary">{roleLabel(m.role)}</Badge>
                  )}

                  {(iAmOwner || isMe) && !lastOwner && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={() =>
                        remove.mutate(
                          { userId: m.user_id },
                          {
                            onSuccess: () => toast.success(isMe ? "You have left the register." : "Removed."),
                            onError: (e: Error) => toast.error(e.message),
                          },
                        )
                      }
                      disabled={remove.isPending}
                    >
                      <UserMinus className="mr-1.5 h-3.5 w-3.5" />
                      {isMe ? "Leave" : "Remove"}
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        {ownerCount <= 1 && (
          <p className="text-xs text-muted-foreground">
            A register keeps at least one owner, so the only owner cannot be removed or
            stepped down. Make somebody else an owner first.
          </p>
        )}
      </section>

      {/* The badge the register puts on its certificates: owners only, because
          it is what the register signs its name with. */}
      {iAmOwner && <CertificateLogoPanel register={entry} />}
      {iAmOwner && <CertificateDesignPanel register={entry} />}

      {/* The lists the forms offer. Part of the register's own data, so they
          are any editor's to change, like the roster. */}
      {canEdit && <ListsPanel blob={blob} onEdit={onEdit} isEvent={entry.kind === "event"} />}

      {/* ---------------------------------------------------------- invite -- */}
      {iAmOwner && (
      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Invite a collaborator</h2>
        <Card>
          <CardContent className="space-y-3 p-4">
            <p className="text-sm text-muted-foreground">
              They get an email with a link. Once they sign in — with Google, Apple or an
              NHS account — the register is theirs to open. The link works for 14 days.
            </p>
            <ul className="space-y-1 text-xs text-muted-foreground">
              {ROLES.map((r) => (
                <li key={r.id}><strong className="text-foreground">{roleLabel(r.id)}:</strong> {r.can}.</li>
              ))}
              <li>An owner invitation only works for the address it is sent to.</li>
            </ul>
            <form onSubmit={onInvite} className="flex flex-wrap items-end gap-3">
              <div className="min-w-[220px] flex-1 space-y-1.5">
                <Label htmlFor="invite-email" className="text-xs">Email address</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input id="invite-email" type="email" required className="pl-9"
                    placeholder="name@nhs.net" value={email}
                    onChange={(e) => setEmail(e.target.value)} />
                </div>
              </div>
              <div className="w-full space-y-1.5 sm:w-[220px]">
                <Label htmlFor="invite-role" className="text-xs">Role</Label>
                <Select value={role} onValueChange={(v) => setRoleChoice(v as RegisterRole)}>
                  <SelectTrigger id="invite-role"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[...ROLES].reverse().map((r) => (
                      <SelectItem key={r.id} value={r.id}>{r.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" className="w-full sm:w-auto" disabled={invite.isPending}>
                <UserPlus className="mr-1.5 h-3.5 w-3.5" />
                {invite.isPending ? "Inviting…" : "Invite"}
              </Button>
            </form>
          </CardContent>
        </Card>

        {pending.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
              Waiting to accept
            </h3>
            {pending.map((i) => {
              const expired = new Date(i.expires_at).getTime() < Date.now();
              return (
                <Card key={i.id}>
                  <CardContent className="flex flex-wrap items-center gap-x-3 gap-y-2 p-4">
                    <div className="min-w-0 basis-full sm:basis-auto">
                      <p className="truncate font-medium">{i.email}</p>
                      <p className="text-xs text-muted-foreground">
                        {roleLabel(i.role)} ·{" "}
                        {expired
                          ? "expired — invite them again for a new link"
                          : `link valid until ${new Date(i.expires_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`}
                      </p>
                    </div>
                    <div className="hidden flex-1 sm:block" />
                    {!expired && (
                      <Button size="sm" variant="outline"
                        onClick={() => void copy(inviteLink(i.token), "Invitation link copied.")}>
                        <Copy className="mr-1.5 h-3.5 w-3.5" /> Copy link
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive"
                      disabled={revoke.isPending}
                      onClick={() => revoke.mutate(i.id, {
                        onSuccess: () => toast.success("Invitation withdrawn."),
                        onError: (err: Error) => toast.error(err.message),
                      })}>
                      <X className="mr-1.5 h-3.5 w-3.5" /> Withdraw
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>
      )}

      {iAmOwner && <RegisterHistoryPanel register={entry} />}

      {iAmOwner && <DeleteRegisterSection register={entry} />}
    </div>
  );
}

/**
 * Deleting the register. It goes to the archive, not straight to oblivion:
 * everything it holds can be restored whole from the register list for fifteen
 * days, after which it is deleted permanently on its own.
 */
function DeleteRegisterSection({ register }: { register: RegisterDirectoryEntry }) {
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);
  const archive = useArchiveRegister();

  const confirm = () =>
    archive.mutate(register.id, {
      onSuccess: (purgeAt) => {
        setConfirming(false);
        navigate("/registers", { replace: true });
        toast.success(`${register.name} has been deleted.`, {
          description:
            `It is in the archive for ${purgeCountdown(purgeAt).toLowerCase()} — restore it ` +
            "from the register list any time before then.",
        });
      },
      onError: (e: Error) => toast.error(e.message),
    });

  return (
    <section className="space-y-3">
      {/* Red whatever colour scheme is chosen: the schemes move the site's
          "destructive" colour with the accent, and deleting a register has to
          look like danger even when the accent is sky or sage. */}
      <h2 className="text-sm font-semibold text-accent-700 dark:text-accent-400">Delete this register</h2>
      <Card className="border border-accent-600/40">
        <CardContent className="flex flex-wrap items-center gap-3 p-4">
          <p className="min-w-[240px] flex-1 text-sm text-muted-foreground">
            Takes {register.name} away from every member, with its people, days,
            attendance and feedback. It waits in the archive on the register list for 15 days
            and can be restored whole until then; after that it is deleted permanently.
          </p>
          <Button size="sm" className="w-full bg-accent-600 text-white hover:bg-accent-700 active:bg-accent-800 sm:w-auto"
            onClick={() => setConfirming(true)}>
            <Archive className="mr-1.5 h-3.5 w-3.5" /> Delete register
          </Button>
        </CardContent>
      </Card>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {register.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Nobody will be able to open it — not just you. It is not destroyed yet: it sits
              in the archive on the register list for 15 days, where an owner can restore it
              or delete it permanently.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-accent-600 text-white hover:bg-accent-700 active:bg-accent-800"
              disabled={archive.isPending}
              onClick={(e) => { e.preventDefault(); confirm(); }}
            >
              {archive.isPending ? "Deleting…" : "Yes, delete it"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
