import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  archiveRegister,
  fetchRegisterInvites,
  fetchRegisterMembers,
  fetchRegisterPeople,
  inviteToRegister,
  removeRegisterMember,
  revokeRegisterInvite,
  setRegisterMemberRole,
} from "@/lib/register/api";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import type { RegisterRole } from "@/lib/register/types";

/**
 * Administering who can use a register.
 *
 * Every mutation invalidates the directory as well as the register's own lists,
 * because member counts and the caller's own `i_am_member` are answered there —
 * a person who removes themselves has to stop seeing the register at all.
 */

export function useRegisterMembers(registerId: string | undefined) {
  const { data: user } = useCurrentUser();
  return useQuery({
    queryKey: ["register-members", registerId, user?.id],
    queryFn: () => fetchRegisterMembers(registerId!),
    enabled: !!registerId && !!user,
  });
}

/** Invitations still waiting to be accepted. Owners only — RLS returns nothing to anyone else. */
export function useRegisterInvites(registerId: string | undefined) {
  const { data: user } = useCurrentUser();
  return useQuery({
    queryKey: ["register-invites", registerId, user?.id],
    queryFn: () => fetchRegisterInvites(registerId!),
    enabled: !!registerId && !!user,
  });
}

/** Names and addresses, keyed by user id, for everyone connected to the register. */
export function useRegisterPeople(registerId: string | undefined) {
  const { data: user } = useCurrentUser();
  return useQuery({
    queryKey: ["register-people", registerId, user?.id],
    queryFn: async () => {
      const people = await fetchRegisterPeople(registerId!);
      return new Map(people.map((p) => [p.user_id, p]));
    },
    enabled: !!registerId && !!user,
  });
}

function useRegisterAccessMutation<TArgs, TResult = unknown>(fn: (args: TArgs) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      for (const key of ["register-members", "register-invites", "register-people", "register-directory"]) {
        queryClient.invalidateQueries({ queryKey: [key] });
      }
    },
  });
}

export function useSetMemberRole(registerId: string | undefined) {
  return useRegisterAccessMutation(({ userId, role }: { userId: string; role: RegisterRole }) =>
    setRegisterMemberRole(registerId!, userId, role),
  );
}

export function useRemoveMember(registerId: string | undefined) {
  return useRegisterAccessMutation(({ userId }: { userId: string }) =>
    removeRegisterMember(registerId!, userId),
  );
}

export function useInviteToRegister(registerId: string | undefined) {
  return useRegisterAccessMutation(({ email, role }: { email: string; role: RegisterRole }) =>
    inviteToRegister(registerId!, email, role),
  );
}

export function useRevokeInvite(_registerId: string | undefined) {
  return useRegisterAccessMutation((inviteId: string) => revokeRegisterInvite(inviteId));
}

/**
 * Delete a register — which archives it for fifteen days rather than
 * destroying it. Its cached contents are dropped rather than refetched: the
 * register has gone from under everyone, and a refetch would only be refused.
 */
export function useArchiveRegister() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (registerId: string) => archiveRegister(registerId),
    onSuccess: () => {
      for (const key of [
        "register-members", "register-invites", "register-people", "register-store",
        "register-session-status", "register-live-sessions", "register-form",
      ]) {
        queryClient.removeQueries({ queryKey: [key] });
      }
      for (const key of ["register-directory", "register-archive"]) {
        queryClient.invalidateQueries({ queryKey: [key] });
      }
    },
  });
}
