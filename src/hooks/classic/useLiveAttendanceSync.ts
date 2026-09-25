import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { markAttended } from "@/lib/classic/liveApi";
import { attendedPayload } from "@/lib/classic/liveSync";
import type { RegisterBlob, RegisterSession } from "@/lib/classic/types";

/**
 * Keeps the live sign-in list in step with every mark made in the register.
 *
 * A tick in the attendance grid, a manual check-in or an undo is a change to
 * who attended — and the live list is what the feedback email and the
 * certificate are sent from. Until this, those marks sat in the register alone
 * until somebody pressed "Sync sign-ins", so a person ticked by hand was
 * invisible to the feedback form and never got a certificate.
 *
 * A teaching day that is not published yet has no live list to reach; its
 * marks go up together when it is published.
 */
export function useClassicLiveAttendanceSync(blob: RegisterBlob) {
  const queryClient = useQueryClient();

  const pushMark = useCallback(
    async (traineeId: string, session: RegisterSession | undefined, present: boolean, grade?: string) => {
      if (!session?.cloudId) return;
      const base = attendedPayload(blob, traineeId, session.id);
      if (!base) return;
      try {
        await markAttended({
          sessionId: session.cloudId,
          trainees: [grade ? { ...base, grade } : base],
          checkedIn: present,
        });
        queryClient.invalidateQueries({ queryKey: ["classic-session-status"] });
      } catch {
        toast.error("Saved here, but the live sign-in list could not be reached", {
          description: "Use “Sync sign-ins” on the Check-in tab to repair it.",
        });
      }
    },
    [blob, queryClient],
  );

  return { pushMark };
}
