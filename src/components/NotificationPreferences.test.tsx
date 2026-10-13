import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const upsert = vi.fn().mockResolvedValue({ error: null });
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => ({ upsert: (...a: unknown[]) => upsert(...a) }) },
}));

import { NotificationPreferences } from "./NotificationPreferences";

function renderIt(saved: unknown) {
  // Seeded and never stale, so nothing reaches the (absent) database.
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
  client.setQueryData(["notification-preferences", "u-1"], saved);
  client.setQueryData(["notification-deaneries"], [{ id: "d-1", name: "North West" }, { id: "d-2", name: "Wessex" }]);
  render(
    <QueryClientProvider client={client}>
      <NotificationPreferences userId="u-1" />
    </QueryClientProvider>,
  );
}

const DEFAULTS = { account_requests: true, register_account_requests: true, specialty_requests: true, deanery_ids: null };

describe("NotificationPreferences", () => {
  it("starts with everything on, and saves a switch turned off", async () => {
    renderIt(DEFAULTS);
    const sw = screen.getByRole("switch", { name: /Specialty access requests/ });
    expect(sw).toBeChecked();
    fireEvent.click(sw);
    await waitFor(() => expect(upsert).toHaveBeenCalledWith(
      { user_id: "u-1", ...DEFAULTS, specialty_requests: false }, { onConflict: "user_id" },
    ));
  });

  it("narrows to chosen deaneries", async () => {
    upsert.mockClear();
    renderIt({ ...DEFAULTS, deanery_ids: [] });
    expect(screen.getByText(/No deaneries ticked/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: /Wessex/ }));
    await waitFor(() => expect(upsert).toHaveBeenCalledWith(
      { user_id: "u-1", ...DEFAULTS, deanery_ids: ["d-2"] }, { onConflict: "user_id" },
    ));
  });
});
