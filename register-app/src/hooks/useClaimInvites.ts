import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { claimInvites } from "@/lib/register/api";
import { useCurrentUser } from "@/hooks/useCurrentUser";

/**
 * Once per signed-in user per page load, accept the invitations addressed to
 * the address they signed in with. A failure is silent: the invitation link
 * still works, and this is a convenience on top of it.
 */
export function useClaimInvites() {
  const { data: user } = useCurrentUser();
  const queryClient = useQueryClient();
  const claimedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!user?.id || claimedFor.current === user.id) return;
    claimedFor.current = user.id;

    claimInvites()
      .then((added) => {
        if (!added) return;
        queryClient.invalidateQueries({ queryKey: ["register-directory"] });
        toast.success(
          added === 1
            ? "You have been added to a register you were invited to."
            : `You have been added to ${added} registers you were invited to.`,
        );
      })
      .catch(() => { /* the link in the email still works */ });
  }, [user?.id, queryClient]);
}
