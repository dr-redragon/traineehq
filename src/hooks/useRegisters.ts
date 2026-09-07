import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createRegister,
  fetchCreatableSpecialties,
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

/** Specialties with no register yet, which the caller is allowed to see. */
export function useCreatableSpecialties(enabled = true) {
  const { data: user } = useCurrentUser();

  return useQuery({
    queryKey: ["register-creatable-specialties", user?.id],
    queryFn: fetchCreatableSpecialties,
    enabled: !!user && enabled,
  });
}

export function useCreateRegister() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ specialtyId, name }: { specialtyId: string; name?: string }) =>
      createRegister(specialtyId, name),
    onSuccess: () => {
      // The new register changes both lists: it appears in the directory as
      // yours, and leaves the set of specialties still available to create.
      queryClient.invalidateQueries({ queryKey: ["register-directory"] });
      queryClient.invalidateQueries({ queryKey: ["register-creatable-specialties"] });
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
