import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useLiveAttendanceSync } from "@/hooks/useLiveAttendanceSync";
import { publishSession } from "@/lib/register/liveApi";
import type { RegisterEdit } from "@/hooks/useRegisterStore";
import type { LiveSession, RegisterBlob, RegisterSession } from "@/lib/register/types";

/** The date a day is published with: its own, or the first of its month if it has none. */
const publishDate = (s: RegisterSession, live?: LiveSession) =>
  s.date || (live && live.session_date.slice(0, 7) === s.month ? live.session_date : `${s.month}-01`);

/** What the live day should say, as one comparable string. */
const wanted = (s: RegisterSession, live?: LiveSession) =>
  [s.title, publishDate(s, live), s.location ?? live?.location ?? ""].join("|");

const current = (live: LiveSession) =>
  [live.title, live.session_date, live.location ?? ""].join("|");

/**
 * Every teaching day is live: it has a check-in page and a QR code from the
 * moment it exists, and nobody has to press "publish".
 *
 * Runs while a register is open and reconciles its teaching days with the
 * published ones:
 *
 *   - a day with no live counterpart is published — which is also how days
 *     recorded before this existed are brought up retrospectively, the first
 *     time anyone opens the register — and anyone already ticked for it is put
 *     on its live list;
 *   - a day whose title, date or location has been edited has the live one
 *     updated to match;
 *   - a day recorded before dates were kept takes its date and location from
 *     the live day, when that was published with a real date. The first of the
 *     month is what undated days are published with, so that is not treated as
 *     a date anyone chose.
 *
 * Publishing is idempotent on the server (keyed by the day's local id), so two
 * organisers with the register open at once cannot produce two QR codes for one
 * day. A change that fails is not retried until the page is reloaded, so an
 * outage is reported once rather than in a loop.
 */
export function useAutoPublishDays(
  registerId: string | undefined,
  blob: RegisterBlob,
  onEdit: (edit: RegisterEdit) => void,
  enabled: boolean,
) {
  const queryClient = useQueryClient();
  const { published, pushAllPresent } = useLiveAttendanceSync(registerId, blob);
  const attempted = useRef(new Set<string>());
  const running = useRef(false);
  const backfilled = useRef(new Set<string>());

  useEffect(() => {
    if (!enabled || !registerId || !published || running.current) return;

    const byLocal = new Map(published.filter((p) => p.local_id).map((p) => [p.local_id!, p]));

    const jobs = blob.sessions.filter((s) => {
      const live = byLocal.get(s.id);
      const key = `${s.id}|${wanted(s, live)}`;
      if (attempted.current.has(key)) return false;
      return !live || current(live) !== wanted(s, live);
    });

    // Undated days whose live day carries a real date: take it back.
    const backfill = blob.sessions.flatMap((s) => {
      const live = byLocal.get(s.id);
      if (!live || s.date || backfilled.current.has(s.id)) return [];
      const real = live.session_date.slice(0, 7) === s.month && live.session_date !== `${s.month}-01`;
      const date = real ? live.session_date : undefined;
      const location = s.location === undefined && live.location ? live.location : undefined;
      return date || location ? [{ id: s.id, date, location }] : [];
    });

    if (backfill.length) {
      backfill.forEach((f) => backfilled.current.add(f.id));
      onEdit((b) => ({
        ...b,
        sessions: b.sessions.map((s) => {
          const fill = backfill.find((f) => f.id === s.id);
          if (!fill || s.date) return s;
          return {
            ...s,
            ...(fill.date ? { date: fill.date } : {}),
            ...(fill.location && s.location === undefined ? { location: fill.location } : {}),
          };
        }),
      }));
    }

    if (!jobs.length) return;
    running.current = true;

    void (async () => {
      let failed = 0;
      for (const s of jobs) {
        const live = byLocal.get(s.id);
        attempted.current.add(`${s.id}|${wanted(s, live)}`);
        try {
          const result = await publishSession({
            registerId,
            title: s.title,
            sessionDate: publishDate(s, live),
            location: s.location ?? live?.location ?? null,
            localId: s.id,
          });
          if (result.created) await pushAllPresent(result.session.id, s.id).catch(() => 0);
        } catch {
          failed++;
        }
      }
      running.current = false;
      await queryClient.invalidateQueries({ queryKey: ["register-live-sessions", registerId] });
      if (failed) {
        toast.error(`${failed} teaching ${failed === 1 ? "day" : "days"} could not be set up for check-in`, {
          description: "Their QR codes will be created the next time the register is opened.",
        });
      }
    })();
  }, [enabled, registerId, published, blob, onEdit, pushAllPresent, queryClient]);
}
