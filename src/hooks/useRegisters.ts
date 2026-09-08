import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createRegister,
  fetchCreatableDeaneries,
  fetchCreatableSpecialties,
  fetchMyRegisterMemberships,
  fetchRegisterDirectory,
  requestRegisterAccess,
} from "@/lib/register/api";
import { groupDirectory } from "@/lib/register/directory";
import { useCurrentUser } from "@/hooks/useUserRole";

/**
 * The register directory, and the things a person can do from it.
 *
 * Everything is keyed on the user, because the directory carries per-caller
 * answers (`i_am_member`, `my_request`) alongside the shared register list — a
 * cache shared between two accounts in one tab would show one of them the
 * other's access.
 */

export function useRegisterDirectory() {
  const { data: user } = useCurrentUser();

  return useQuery({
    queryKey: ["register-directory", user?.id],
    queryFn: fetchRegisterDirectory,
    enabled: !!user,
  });
}

/** The directory split into: yours, waiting on a decision, and askable. */
export function useGroupedRegisters() {
  const query = useRegisterDirectory();
  return { ...query, grouped: groupDirectory(query.data ?? []) };
}

/** The deaneries this person may open a register in. */
export function useCreatableDeaneries(enabled = true) {
  const { data: user } = useCurrentUser();

  return useQuery({
    queryKey: ["register-creatable-deaneries", user?.id],
    queryFn: fetchCreatableDeaneries,
    enabled: !!user && enabled,
  });
}

/** The specialties still open in one deanery. */
export function useCreatableSpecialties(deaneryId: string | undefined) {
  const { data: user } = useCurrentUser();

  return useQuery({
    queryKey: ["register-creatable-specialties", deaneryId, user?.id],
    queryFn: () => fetchCreatableSpecialties(deaneryId!),
    enabled: !!user && !!deaneryId,
  });
}

export function useCreateRegister() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ deaneryId, specialtyId, name }:
      { deaneryId: string; specialtyId: string; name?: string }) =>
      createRegister(deaneryId, specialtyId, name),
    onSuccess: () => {
      // The new register changes three lists: it appears in the directory as
      // yours, leaves the specialties still open in that deanery, and — for
      // somebody who held no register until now — adds a deanery they may
      // create in.
      queryClient.invalidateQueries({ queryKey: ["register-directory"] });
      queryClient.invalidateQueries({ queryKey: ["register-creatable-specialties"] });
      queryClient.invalidateQueries({ queryKey: ["register-creatable-deaneries"] });
      queryClient.invalidateQueries({ queryKey: ["my-register-memberships"] });
    },
  });
}

export function useRequestRegisterAccess() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ registerId, reason }: { registerId: string; reason?: string }) =>
      requestRegisterAccess(registerId, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["register-directory"] });
    },
  });
}

/**
 * Whether this user holds any register at all.
 *
 * Deliberately narrow — it reads only the caller's own `register_members` rows,
 * which RLS allows, rather than pulling the whole directory. The sidebar asks
 * this on every page, so it should be the cheapest question that answers
 * "is there anything here for me".
 *
 * Membership-derived, not role-derived: the link appears because you hold a
 * register, never because of what you are in TraineeHQ.
 */
export function useMyRegisterMemberships() {
  const { data: user } = useCurrentUser();

  return useQuery({
    queryKey: ["my-register-memberships", user?.id],
    queryFn: fetchMyRegisterMemberships,
    enabled: !!user,
  });
}
