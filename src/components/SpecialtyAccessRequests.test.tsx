import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const rpc = vi.fn().mockResolvedValue({ error: null });
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));

import { SpecialtyAccessRequests } from "./SpecialtyAccessRequests";

const req = (id: string, status: string, note: string | null = null) => ({
  id, specialty_id: `s-${id}`, status, reason: null, review_note: note,
  created_at: "2026-10-01T00:00:00Z", reviewed_at: null,
});
const requests = [req("a", "approved", "Welcome aboard"), req("b", "rejected", "Not this term"), req("c", "pending")];

function renderIt() {
  // Seeded and never stale, so nothing reaches the (absent) database.
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
  client.setQueryData(["requestable-specialties", "u-1"], []);
  client.setQueryData(["my-specialty-requests", "u-1"], requests);
  client.setQueryData(["my-specialty-request-names", ["s-a", "s-b", "s-c"]], { "s-a": "ENT", "s-b": "Urology", "s-c": "Plastics" });
  render(
    <QueryClientProvider client={client}>
      <SpecialtyAccessRequests userId="u-1" homeDeaneryId={null} />
    </QueryClientProvider>,
  );
}

describe("SpecialtyAccessRequests", () => {
  it("offers Clear on answered requests only, and Withdraw on pending ones", () => {
    renderIt();
    expect(screen.getByRole("button", { name: /Clear the answered request for ENT/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Clear the answered request for Urology/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Clear the answered request for Plastics/ })).toBeNull();
    expect(screen.getByRole("button", { name: /Withdraw/ })).toBeInTheDocument();
  });

  it("clears every answered request at once", async () => {
    renderIt();
    fireEvent.click(screen.getByRole("button", { name: /Clear all answered/ }));
    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(2));
    expect(rpc).toHaveBeenCalledWith("clear_specialty_access_request", { _request_id: "a" });
    expect(rpc).toHaveBeenCalledWith("clear_specialty_access_request", { _request_id: "b" });
  });
});
