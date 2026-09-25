import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { fetchLiveSessions, markAttended, publishSession } from "@/lib/classic/liveApi";
import { presentPayloads } from "@/lib/classic/liveSync";
import type { RegisterEdit } from "@/hooks/classic/useRegisterStore";
import type { LiveSession, RegisterBlob, RegisterSession } from "@/lib/classic/types";

/** The date a day is published with: its own, or the first of its month if it has none. */
const publishDate = (s: RegisterSession, live?: LiveSession) =>
  s.date || (live && live.session_date.slice(0, 7) === s.month ? live.session_date : `${s.month}-01`);

const wanted = (s: RegisterSession, live?: LiveSession) =>
  [s.title, publishDate(s, live), s.location ?? live?.location ?? ""].join("|");

const current = (live: LiveSession) =>
  [live.title, live.session_date, live.location ?? ""].join("|");

/**
 * Every classic teaching day is live — check-in page and QR code — without
 * anyone publishing it, and stays in step with what the register says about it.
 *
 * The live register's `useAutoPublishDays`, for the classic register's shape,
 * where a teaching day carries its live id (`cloudId`) on the blob itself:
 *
 *   - a day with no live counterpart is published and linked, and anyone
 *     already ticked for it goes on its live list — which is also how days
 *     recorded before this are brought up, the first time the register opens;
 *   - a day whose title, date or place was edited has its live page updated;
 *   - a day recorded with only a month takes its date and place back from its
 *     live page, when that was published with a real date.
 *
 * Publishing is keyed on the day's local id server-side, so two organisers with
 * the register open cannot make two QR codes for one day. A failed change is
 * not retried until the page is reloaded.
 */
export function useClassicAutoPublishDays(
  registerId: string | undefined,
  blob: RegisterBlob,
  edit: (fn: RegisterEdit) => void,
  enabled: boolean,
) {
  const queryClient = useQueryClient();
  const { data: published } = useQuery({
    queryKey: ["classic-live-sessions", registerId],
    queryFn: () => fetchLiveSessions(registerId!),
    enabled: !!registerId && enabled,
  });
  const attempted = useRef(new Set<string>());
  const settled = useRef(new Set<string>());
  const running = useRef(false);

  useEffect(() => {
    if (!enabled || !registerId || !published || running.current) return;

    const byId = new Map(published.map((p) => [p.id, p]));
    const byLocal = new Map(published.filter((p) => p.local_id).map((p) => [p.local_id!, p]));
    const liveFor = (s: RegisterSession) =>
      (s.cloudId ? byId.get(s.cloudId) : undefined) ?? byLocal.get(s.id);

    // Links and dates the register can take straight from what is published.
    const fixes = blob.sessions.flatMap((s) => {
      const live = liveFor(s);
      if (!live || settled.current.has(s.id)) return [];
      const fix: Partial<RegisterSession> = {};
      if (s.cloudId !== live.id) fix.cloudId = live.id;
      if (!s.date && live.session_date.slice(0, 7) === s.month && live.session_date !== `${s.month}-01`) {
        fix.date = live.session_date;
      }
      if (s.location === undefined && live.location) fix.location = live.location;
      return Object.keys(fix).length ? [{ id: s.id, fix }] : [];
    });
    if (fixes.length) {
      fixes.forEach((f) => settled.current.add(f.id));
      edit((b) => ({
        ...b,
        sessions: b.sessions.map((s) => {
          const found = fixes.find((f) => f.id === s.id);
          return found ? { ...s, ...found.fix, ...(s.date ? { date: s.date } : {}) } : s;
        }),
      }));
    }

    const jobs = blob.sessions.filter((s) => {
      const live = liveFor(s);
      if (attempted.current.has(`${s.id}|${wanted(s, live)}`)) return false;
      return !live || current(live) !== wanted(s, live);
    });
    if (!jobs.length) return;
    running.current = true;

    void (async () => {
      let failed = 0;
      const linked: { id: string; cloudId: string }[] = [];
      for (const s of jobs) {
        const live = liveFor(s);
        attempted.current.add(`${s.id}|${wanted(s, live)}`);
        try {
          const { session, created } = await publishSession({
            registerId,
            title: s.title,
            sessionDate: publishDate(s, live),
            location: s.location ?? live?.location ?? null,
            localId: s.id,
          });
          if (s.cloudId !== session.id) linked.push({ id: s.id, cloudId: session.id });
          if (created) {
            const already = presentPayloads(blob, s.id);
            if (already.length) {
              await markAttended({ sessionId: session.id, trainees: already }).catch(() => undefined);
            }
          }
        } catch {
          failed++;
        }
      }
      running.current = false;
      if (linked.length) {
        edit((b) => ({
          ...b,
          sessions: b.sessions.map((s) => {
            const l = linked.find((x) => x.id === s.id);
            return l ? { ...s, cloudId: l.cloudId } : s;
          }),
        }));
      }
      await queryClient.invalidateQueries({ queryKey: ["classic-live-sessions", registerId] });
      await queryClient.invalidateQueries({ queryKey: ["classic-session-status"] });
      if (failed) {
        toast.error(`${failed} teaching ${failed === 1 ? "day" : "days"} could not be set up for check-in`, {
          description: "Their QR codes will be created the next time the register is opened.",
        });
      }
    })();
  }, [enabled, registerId, published, blob, edit, queryClient]);
}
