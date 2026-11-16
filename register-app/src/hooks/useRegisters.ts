import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createRegister, deleteRegister, fetchPlan, fetchRegisterArchive, fetchRegisterDirectory,
  restoreRegister,
} from "@/lib/register/api";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import type { RegisterKind } from "@/lib/register/types";

/**
 * The register list, and the things a person can do from it. Everything is
 * keyed on the user: a cache shared between two accounts in one tab would show
 * one of them the other's registers.
 */
export function useRegisterDirectory() {
  const { data: user } = useCurrentUser();

  return useQuery({
    queryKey: ["register-directory", user?.id],
    queryFn: fetchRegisterDirectory,
    enabled: !!user,
  });
}

/** What this account is paying for. Decides what the create form can offer. */
export function usePlan() {
  const { data: user } = useCurrentUser();

  return useQuery({
    queryKey: ["plan", user?.id],
    queryFn: fetchPlan,
    enabled: !!user,
  });
}

export function useCreateRegister() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ name, kind, organisation }:
      { name: string; kind: RegisterKind; organisation?: string }) =>
      createRegister(name, kind, organisation),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["register-directory"] }),
  });
}

/**
 * The registers this person has deleted but can still get back. Kept off the
 * directory's own query: this one writes (the RPC sweeps expired entries first)
 * and concerns only the few people who have actually deleted something.
 */
export function useRegisterArchive() {
  const { data: user } = useCurrentUser();

  return useQuery({
    queryKey: ["register-archive", user?.id],
    queryFn: fetchRegisterArchive,
    enabled: !!user,
  });
}

function useArchiveMutation<TArgs>(fn: (args: TArgs) => Promise<unknown>) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      for (const key of ["register-archive", "register-directory"]) {
        queryClient.invalidateQueries({ queryKey: [key] });
      }
    },
  });
}

export function useRestoreRegister() {
  return useArchiveMutation((registerId: string) => restoreRegister(registerId));
}

/** Destroy an archived register now rather than waiting out its fifteen days. */
export function useDeleteRegisterForever() {
  return useArchiveMutation((registerId: string) => deleteRegister(registerId));
}
