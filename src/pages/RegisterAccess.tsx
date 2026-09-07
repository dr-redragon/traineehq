import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Check, Crown, Mail, UserMinus, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  useDecideAccess, useInviteToRegister, useRegisterMembers, useRegisterPeople,
  useRegisterRequests, useRemoveMember, useSetMemberRole,
} from "@/hooks/useRegisterAccess";
import { useRegisterDirectory } from "@/hooks/useRegisters";
import { useCurrentUser } from "@/hooks/useUserRole";
import type { RegisterPerson, RegisterRole } from "@/lib/register/types";

function nameOf(person: RegisterPerson | undefined, fallback: string) {
  const name = [person?.first_name, person?.last_name].filter(Boolean).join(" ").trim();
  return name || person?.email || fallback;
}

export default function RegisterAccess() {
  const { slug } = useParams<{ slug: string }>();
  const { data: user } = useCurrentUser();
  const { data: directory, isLoading: directoryLoading } = useRegisterDirectory();
  const entry = directory?.find((r) => r.slug === slug);

  const { data: members, isLoading: membersLoading } = useRegisterMembers(entry?.id);
  const { data: requests } = useRegisterRequests(entry?.id);
  const { data: people } = useRegisterPeople(entry?.id);

  const decide = useDecideAccess();
  const setRole = useSetMemberRole(entry?.id);
  const remove = useRemoveMember(entry?.id);
  const invite = useInviteToRegister(entry?.id);

  const [notes, setNotes] = useState<Record<string, string>>({});
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<RegisterRole>("editor");

  const myRole = members?.find((m) => m.user_id === user?.id)?.role;
  const iAmOwner = myRole === "owner";
  const ownerCount = members?.filter((m) => m.role === "owner").length ?? 0;
  const pending = requests?.filter((r) => r.status === "pending") ?? [];

  if (directoryLoading || membersLoading) {
    return <Skeleton className="h-64 w-full" />;
  }

  if (!entry?.i_am_member) {
    return (
      <Card>
        <CardContent className="space-y-4 py-10 text-center">
          <p className="text-sm text-muted-foreground">
            Only members of a register can see who else uses it.
          </p>
          <Button asChild variant="outline" size="sm">
            <Link to="/registers"><ArrowLeft className="mr-1.5 h-3.5 w-3.5" /> All registers</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const onDecide = (requestId: string, approve: boolean) =>
    decide.mutate(
      { requestId, approve, note: notes[requestId] },
      {
        onSuccess: () => toast.success(approve ? "Access granted." : "Request refused."),
        onError: (e: Error) => toast.error(e.message),
      },
    );

  const onInvite = () =>
    invite.mutate(
      { email: inviteEmail, role: inviteRole },
      {
        onSuccess: (result) => {
          const r = result as { created: boolean; email_sent: boolean };
          setInviteEmail("");
          toast.success(
            r.created
              ? "Account created and added. They have been emailed a link to set a password."
              : r.email_sent
                ? "Added, and emailed to let them know."
                : "Added. The notification email could not be sent.",
          );
        },
        onError: (e: Error) => toast.error(e.message),
      },
    );

  return (
    <div className="space-y-10">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2 text-xs">
          <Link to={`/registers/${slug}`}>
            <ArrowLeft className="mr-1.5 h-3.5 w-3.5" /> {entry.specialty_name}
          </Link>
        </Button>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Who can use this register</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Access is granted per person and has nothing to do with anyone's TraineeHQ role.
          Any member can admit someone; only an owner can change roles or remove people.
        </p>
      </div>

      {/* -------------------------------------------------------- requests -- */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold">
          Requests {pending.length > 0 && <Badge variant="secondary" className="ml-1">{pending.length}</Badge>}
        </h2>

        {pending.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nobody is waiting to join.</p>
        ) : (
          <div className="space-y-3">
            {pending.map((r) => {
              const person = people?.get(r.user_id);
              const isMine = r.user_id === user?.id;
              return (
                <Card key={r.id}>
                  <CardContent className="space-y-3 p-4">
                    <div>
                      <p className="font-medium">{nameOf(person, "Someone")}</p>
                      {person?.email && (
                        <p className="text-xs text-muted-foreground">{person.email}</p>
                      )}
                      {r.reason && (
                        <p className="mt-2 border-l-2 pl-3 text-sm text-muted-foreground">{r.reason}</p>
                      )}
                    </div>

                    {isMine ? (
                      <p className="text-xs text-muted-foreground">
                        This is your own request — somebody else has to decide it.
                      </p>
                    ) : (
                      <>
                        <Textarea
                          rows={2}
                          placeholder="A note for them (optional)"
                          value={notes[r.id] ?? ""}
                          onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })}
                        />
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => onDecide(r.id, true)} disabled={decide.isPending}>
                            <Check className="mr-1.5 h-3.5 w-3.5" /> Grant access
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => onDecide(r.id, false)} disabled={decide.isPending}>
                            <X className="mr-1.5 h-3.5 w-3.5" /> Refuse
                          </Button>
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>

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
                <CardContent className="flex flex-wrap items-center gap-3 p-4">
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {nameOf(person, "Unknown")}
                      {isMe && <span className="ml-1.5 text-xs text-muted-foreground">(you)</span>}
                    </p>
                    {person?.email && (
                      <p className="truncate text-xs text-muted-foreground">{person.email}</p>
                    )}
                  </div>

                  <div className="flex-1" />

                  {m.role === "owner" ? (
                    <Badge className="gap-1"><Crown className="h-3 w-3" /> Owner</Badge>
                  ) : (
                    <Badge variant="secondary">Editor</Badge>
                  )}

                  {iAmOwner && !lastOwner && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setRole.mutate(
                          { userId: m.user_id, role: m.role === "owner" ? "editor" : "owner" },
                          {
                            onSuccess: () => toast.success("Role updated."),
                            onError: (e: Error) => toast.error(e.message),
                          },
                        )
                      }
                      disabled={setRole.isPending}
                    >
                      {m.role === "owner" ? "Make editor" : "Make owner"}
                    </Button>
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

      {/* ---------------------------------------------------------- invite -- */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Add somebody</h2>
        <Card>
          <CardContent className="space-y-3 p-4">
            <p className="text-sm text-muted-foreground">
              They do not need a TraineeHQ account. If they have none, one is created and
              they are emailed a link to set a password.
            </p>

            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-[240px] flex-1 space-y-1.5">
                <Label htmlFor="invite-email" className="text-xs">Email address</Label>
                <Input
                  id="invite-email"
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="colleague@nhs.net"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="invite-role" className="text-xs">As</Label>
                <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as RegisterRole)}>
                  <SelectTrigger id="invite-role" className="w-[130px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="editor">Editor</SelectItem>
                    {/* Only an owner can create another; the server refuses either way. */}
                    <SelectItem value="owner" disabled={!iAmOwner}>Owner</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button onClick={onInvite} disabled={!inviteEmail.trim() || invite.isPending}>
                {invite.isPending ? (
                  <><Mail className="mr-1.5 h-4 w-4" /> Adding…</>
                ) : (
                  <><UserPlus className="mr-1.5 h-4 w-4" /> Add</>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
