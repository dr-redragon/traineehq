import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAutoPublishDays } from "./useAutoPublishDays";
import { EMPTY_REGISTER, type LiveSession, type RegisterBlob } from "@/lib/register/types";

/*
 * Every teaching day is set up for check-in on its own: new ones, ones recorded
 * before this was automatic, and ones whose details were edited since. Days
 * recorded with only a month take their real date back from the live day.
 */

const publishSession = vi.fn();
const fetchLiveSessions = vi.fn();
const markAttended = vi.fn();
vi.mock("@/lib/register/liveApi", () => ({
  publishSession: (...a: unknown[]) => publishSession(...a),
  fetchLiveSessions: (...a: unknown[]) => fetchLiveSessions(...a),
  markAttended: (...a: unknown[]) => markAttended(...a),
}));

const live = (over: Partial<LiveSession>): LiveSession => ({
  id: "live", register_id: "reg", title: "", session_date: "", location: null, local_id: null, form: null,
  ...over,
});

function run(blob: RegisterBlob, published: LiveSession[]) {
  fetchLiveSessions.mockResolvedValue(published);
  const onEdit = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  renderHook(() => useAutoPublishDays("reg", blob, onEdit, true), { wrapper });
  return { onEdit };
}

describe("useAutoPublishDays", () => {
  beforeEach(() => {
    publishSession.mockReset().mockResolvedValue({ session: { id: "new-live" }, created: true });
    fetchLiveSessions.mockReset();
    markAttended.mockReset().mockResolvedValue({ marked: 1, no_email: [] });
  });

  it("publishes a day with no live page, dated and placed, and sends up who is already ticked", async () => {
    run({
      ...EMPTY_REGISTER,
      trainees: [{ id: "t1", name: "Alice" }],
      sessions: [{ id: "s1", month: "2026-03", date: "2026-03-12", title: "Otology", location: "MRI" }],
      attendance: { "t1|s1": true },
    }, []);

    await waitFor(() => expect(publishSession).toHaveBeenCalledWith({
      registerId: "reg", title: "Otology", sessionDate: "2026-03-12", location: "MRI", localId: "s1",
    }));
    await waitFor(() => expect(markAttended).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: "new-live" })));
  });

  it("publishes an old, undated day on the first of its month", async () => {
    run({ ...EMPTY_REGISTER, sessions: [{ id: "s1", month: "2025-11", title: "Airway" }] }, []);
    await waitFor(() => expect(publishSession).toHaveBeenCalledWith(
      expect.objectContaining({ sessionDate: "2025-11-01", localId: "s1" })));
  });

  it("updates a live day whose title or date was edited, and leaves a matching one alone", async () => {
    run({
      ...EMPTY_REGISTER,
      sessions: [
        { id: "s1", month: "2026-03", date: "2026-03-19", title: "Otology" },
        { id: "s2", month: "2026-03", date: "2026-03-26", title: "Rhinology" },
      ],
    }, [
      live({ id: "l1", local_id: "s1", title: "Otology", session_date: "2026-03-12" }),
      live({ id: "l2", local_id: "s2", title: "Rhinology", session_date: "2026-03-26" }),
    ]);
    await waitFor(() => expect(publishSession).toHaveBeenCalledTimes(1));
    expect(publishSession).toHaveBeenCalledWith(expect.objectContaining({ localId: "s1", sessionDate: "2026-03-19" }));
  });

  it("gives an undated day the real date it was published with", async () => {
    const { onEdit } = run(
      { ...EMPTY_REGISTER, sessions: [{ id: "s1", month: "2026-03", title: "Otology" }] },
      [live({ local_id: "s1", title: "Otology", session_date: "2026-03-12", location: "MRI" })],
    );
    await waitFor(() => expect(onEdit).toHaveBeenCalled());
    const edited = onEdit.mock.calls[0][0]({
      ...EMPTY_REGISTER, sessions: [{ id: "s1", month: "2026-03", title: "Otology" }],
    });
    expect(edited.sessions[0]).toMatchObject({ date: "2026-03-12", location: "MRI" });
    expect(publishSession).not.toHaveBeenCalled();
  });
});
