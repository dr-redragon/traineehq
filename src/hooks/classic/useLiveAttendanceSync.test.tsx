import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useClassicLiveAttendanceSync } from "./useLiveAttendanceSync";
import { EMPTY_REGISTER, type RegisterBlob } from "@/lib/classic/types";

/*
 * A mark made in the classic register has to reach the live sign-in list on
 * its own — the feedback email and the certificate are sent from there — and
 * an unpublished day, which has no live list, must not be sent anything.
 */

const markAttended = vi.fn();
vi.mock("@/lib/classic/liveApi", () => ({
  markAttended: (...args: unknown[]) => markAttended(...args),
}));

const published = { id: "s1", month: "2026-02", title: "Feb", cloudId: "live-1" };
const unpublished = { id: "s2", month: "2026-03", title: "Mar" };

const blob: RegisterBlob = {
  ...EMPTY_REGISTER,
  trainees: [{ id: "t1", name: "Alice Adeyemi", grade: "ST6", email: "alice@example.invalid" }],
  sessions: [published, unpublished],
};

function setup() {
  const client = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(() => useClassicLiveAttendanceSync(blob), { wrapper }).result;
}

describe("useClassicLiveAttendanceSync", () => {
  beforeEach(() => {
    markAttended.mockReset();
    markAttended.mockResolvedValue({ marked: 1, no_email: [] });
  });

  it("sends a tick, and an untick, to the published day's live list", async () => {
    const result = setup();
    await act(() => result.current.pushMark("t1", published, true, "ST7"));
    await act(() => result.current.pushMark("t1", published, false));

    expect(markAttended).toHaveBeenNthCalledWith(1, {
      sessionId: "live-1",
      trainees: [expect.objectContaining({ name: "Alice Adeyemi", local_trainee_id: "t1", grade: "ST7" })],
      checkedIn: true,
    });
    expect(markAttended).toHaveBeenNthCalledWith(2, expect.objectContaining({ checkedIn: false }));
  });

  it("sends nothing for a day that has not been published", async () => {
    const result = setup();
    await act(() => result.current.pushMark("t1", unpublished, true));
    expect(markAttended).not.toHaveBeenCalled();
  });
});
