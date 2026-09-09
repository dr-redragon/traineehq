import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  RegisterConflictError, fetchRegisterStore, saveRegister,
} from "@/lib/register/api";
import { normaliseBlob } from "@/lib/register/blob";
import { useCurrentUser } from "@/hooks/useUserRole";
import type { RegisterBlob } from "@/lib/register/types";

/** An edit, expressed as a pure function so it can be replayed. */
export type RegisterEdit = (blob: RegisterBlob) => RegisterBlob;

const MAX_ATTEMPTS = 4;

/**
 * Read and write one register's blob.
 *
 * The whole register is stored and written as a single JSONB document, so two
 * organisers editing on the same evening would, with a naive save, silently
 * discard one another's work. `save_register()` refuses any write built on a
 * version that has since moved, and this hook is the other half of that
 * bargain.
 *
 * Edits are therefore passed as **functions of the current blob**, not as
 * finished blobs. When a save is rejected the hook re-reads whatever the other
 * person wrote and applies the same function again on top of it, so "tick Alice
 * present" survives as "tick Alice present", rather than reverting the session
 * their colleague added a moment earlier. That is only sound because every
 * operation in `lib/register/blob.ts` is pure — hence the test that says so.
 *
 * Four attempts, because each retry costs a round trip and a genuine edit
 * collision resolves in one or two; more than that means something is writing
 * in a loop, and failing loudly beats retrying forever.
 */
export function useRegisterStore(
  registerId: string | undefined,
  options: {
    /**
     * Keep the blob fresh while a teaching day is being run.
     *
     * A trainee scanning the QR writes the attendance mark server-side, through
     * `register_record_checkin()`. Nothing tells this tab about it, so without a
     * poll the organiser watches a grid that says nobody has arrived. Only the
     * Check-in tab asks for this: everywhere else, a register is a document
     * somebody is reading, and re-fetching it every twenty seconds would be
     * traffic spent on nothing.
     */
    live?: boolean;
  } = {},
) {
  const queryClient = useQueryClient();
  const { data: user } = useCurrentUser();
  const queryKey = ["register-store", registerId, user?.id];

  const query = useQuery({
    queryKey,
    queryFn: () => fetchRegisterStore(registerId!),
    enabled: !!registerId && !!user,
    refetchInterval: options.live ? 20_000 : false,
    // Coming back to the tab after showing the QR on the projector should not
    // mean waiting out the interval to see who signed in.
    refetchOnWindowFocus: options.live,
  });

  const mutation = useMutation({
    mutationFn: async (edit: RegisterEdit) => {
      let current = query.data ?? (await fetchRegisterStore(registerId!));
      if (!current) throw new Error("That register no longer exists");

      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        const next = edit(normaliseBlob(current.data));

        try {
          const version = await saveRegister(registerId!, next, current.version);
          return { ...current, data: next, version };
        } catch (error) {
          if (!(error instanceof RegisterConflictError) || attempt === MAX_ATTEMPTS) throw error;

          const fresh = await fetchRegisterStore(registerId!);
          if (!fresh) throw new Error("That register no longer exists");
          current = fresh;
        }
      }

      // Unreachable: the loop either returns or throws on its last attempt.
      throw new RegisterConflictError("Could not save — the register kept changing underneath.");
    },

    // Write the confirmed result straight into the cache. Re-fetching would be
    // a round trip to learn what the save already told us, and would briefly
    // show the old figures while it ran.
    onSuccess: (saved) => queryClient.setQueryData(queryKey, saved),

    onError: (error: Error) => toast.error(error.message),
  });

  const { mutate } = mutation;
  const edit = useCallback((fn: RegisterEdit) => mutate(fn), [mutate]);

  return {
    /** Always a whole blob, even for a register that has never been written. */
    blob: normaliseBlob(query.data?.data),
    version: query.data?.version ?? 0,
    isLoading: query.isLoading,
    error: query.error as Error | null,
    /** Apply an edit. Retries on a conflict by replaying it on the newer blob. */
    edit,
    isSaving: mutation.isPending,
    /** Re-read now, rather than waiting for the poll. */
    refresh: () => queryClient.invalidateQueries({ queryKey }),
  };
}
