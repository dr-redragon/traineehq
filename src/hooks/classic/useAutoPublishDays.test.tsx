import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useClassicAutoPublishDays } from "./useAutoPublishDays";
import { EMPTY_REGISTER, type LiveSession, type RegisterBlob } from "@/lib/classic/types";

/*
 * Every classic teaching day is set up for check-in on its own — new days,
 * days recorded before this was automatic, days edited since — and linked to
 * its live page through `cloudId`. Undated days take their real date back.
 */

const publishSession = vi.fn();
const fetchLiveSessions = vi.fn();
const markAttended = vi.fn();
vi.mock("@/lib/classic/liveApi", () => ({
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
  const edit = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  renderHook(() => useClassicAutoPublishDays("reg", blob, edit, true), { wrapper });
  return { edit, applied: (base: RegisterBlob) => edit.mock.calls.reduce((b, [fn]) => fn(b), base) };
}

describe("useClassicAutoPublishDays", () => {
  beforeEach(() => {
    publishSession.mockReset().mockResolvedValue({ session: { id: "new-live" }, created: true });
    fetchLiveSessions.mockReset();
    markAttended.mockReset().mockResolvedValue({ marked: 1, no_email: [] });
  });

  it("sets up an old undated day, links it, and sends up who is already ticked", async () => {
    const blob: RegisterBlob = {
      ...EMPTY_REGISTER,
      trainees: [{ id: "t1", name: "Alice" }],
      sessions: [{ id: "s1", month: "2025-11", title: "Airway" }],
      attendance: { "t1|s1": true },
    };
    const { edit, applied } = run(blob, []);
    await waitFor(() => expect(edit).toHaveBeenCalled());
    expect(publishSession).toHaveBeenCalledWith(expect.objectContaining({ sessionDate: "2025-11-01", localId: "s1" }));
    expect(markAttended).toHaveBeenCalledWith(expect.objectContaining({ sessionId: "new-live" }));
    expect(applied(blob).sessions[0].cloudId).toBe("new-live");
  });

  it("updates the live page of a day whose date was edited", async () => {
    run({
      ...EMPTY_REGISTER,
      sessions: [{ id: "s1", month: "2026-03", date: "2026-03-19", title: "Otology", cloudId: "l1" }],
    }, [live({ id: "l1", local_id: "s1", title: "Otology", session_date: "2026-03-12" })]);
    await waitFor(() => expect(publishSession).toHaveBeenCalledWith(
      expect.objectContaining({ localId: "s1", sessionDate: "2026-03-19" })));
  });

  it("gives an undated day the real date it was published with, and publishes nothing", async () => {
    const blob: RegisterBlob = {
      ...EMPTY_REGISTER,
      sessions: [{ id: "s1", month: "2026-03", title: "Otology", cloudId: "l1" }],
    };
    const { edit, applied } = run(blob, [
      live({ id: "l1", local_id: "s1", title: "Otology", session_date: "2026-03-12", location: "MRI" }),
    ]);
    await waitFor(() => expect(edit).toHaveBeenCalled());
    expect(applied(blob).sessions[0]).toMatchObject({ date: "2026-03-12", location: "MRI" });
    expect(publishSession).not.toHaveBeenCalled();
  });
});
