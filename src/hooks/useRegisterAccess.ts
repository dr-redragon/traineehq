import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  decideRegisterAccess,
  fetchRegisterMembers,
  fetchRegisterPeople,
  fetchRegisterRequests,
  inviteToRegister,
  removeRegisterMember,
  setRegisterMemberRole,
} from "@/lib/register/api";
import { useCurrentUser } from "@/hooks/useUserRole";
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

export function useRegisterRequests(registerId: string | undefined) {
  const { data: user } = useCurrentUser();
  return useQuery({
    queryKey: ["register-requests", registerId, user?.id],
    queryFn: () => fetchRegisterRequests(registerId!),
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

function useRegisterAccessMutation<TArgs>(fn: (args: TArgs) => Promise<unknown>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      for (const key of ["register-members", "register-requests", "register-people", "register-directory"]) {
        queryClient.invalidateQueries({ queryKey: [key] });
      }
    },
  });
}

/** Approving or refusing needs only the request's own id. */
export function useDecideAccess() {
  return useRegisterAccessMutation(
    ({ requestId, approve, note }: { requestId: string; approve: boolean; note?: string }) =>
      decideRegisterAccess(requestId, approve, note),
  );
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
