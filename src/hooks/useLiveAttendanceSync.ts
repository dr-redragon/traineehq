import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { fetchLiveSessions, markAttended } from "@/lib/register/liveApi";
import { attendedPayload, presentPayloads } from "@/lib/register/liveSync";
import type { LiveSession, RegisterBlob } from "@/lib/register/types";

/**
 * The grid's half of the two-way sync.
 *
 * A tick in the attendance grid is as much a check-in as a trainee scanning the
 * QR code, and it has to reach Supabase for the same reasons: without an
 * attendee row that person is not on the feedback form's list, cannot be sent a
 * link and can never be issued a certificate. Before this, only the QR path
 * wrote one — which is why a day published after the fact showed an empty live
 * list beside a grid full of ticks.
 *
 * Best effort by design. The register is the record; a failed push is reported
 * once and repaired by "Re-sync sign-ins" rather than blocking the edit or
 * rolling it back.
 */
export function useLiveAttendanceSync(registerId: string | undefined, blob: RegisterBlob) {
  const queryClient = useQueryClient();

  const { data: published } = useQuery({
    queryKey: ["register-live-sessions", registerId],
    queryFn: () => fetchLiveSessions(registerId!),
    enabled: !!registerId,
  });

  const publishedFor = useCallback(
    (localSessionId: string): LiveSession | undefined =>
      published?.find((s) => s.local_id === localSessionId),
    [published],
  );

  /** Mirror one cell. A day that has never been published is simply skipped. */
  const pushMark = useCallback(
    async (
      traineeId: string,
      localSessionId: string,
      present: boolean,
      /**
       * The grade just chosen, for the manual check-in. The blob in this
       * closure is the one from before the edit, so a grade picked in the same
       * gesture is not in it yet and has to be handed over.
       */
      grade?: string,
    ) => {
      const live = publishedFor(localSessionId);
      if (!live) return;

      const base = attendedPayload(blob, traineeId, localSessionId);
      if (!base) return;
      const payload = grade ? { ...base, grade } : base;

      try {
        await markAttended({ sessionId: live.id, trainees: [payload], checkedIn: present });
        queryClient.invalidateQueries({ queryKey: ["register-session-status", live.id] });
      } catch {
        toast.error("Saved here, but the live sign-in list could not be reached", {
          description: "Use “Re-sync sign-ins” on the Check-in tab to repair it.",
        });
      }
    },
    [blob, publishedFor, queryClient],
  );

  /**
   * Push every mark the register already holds for a teaching day.
   *
   * Called when a day is published, so a day that already happened arrives live
   * with its attendance intact, and by the re-sync button afterwards.
   */
  const pushAllPresent = useCallback(
    async (liveSessionId: string, localSessionId: string): Promise<number> => {
      const trainees = presentPayloads(blob, localSessionId);
      if (!trainees.length) return 0;
      const result = await markAttended({ sessionId: liveSessionId, trainees, checkedIn: true });
      return result.marked;
    },
    [blob],
  );

  return { published, publishedFor, pushMark, pushAllPresent };
}
