import { describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

let response: { error: unknown; status: number };
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => ({ select: () => ({ limit: async () => response }) }) },
}));

import { useSchoolsReady } from "./useSchoolsReady";

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
);

describe("useSchoolsReady", () => {
  it("is false when the table is missing, even if no error object comes back", async () => {
    response = { error: null, status: 404 };
    const { result } = renderHook(() => useSchoolsReady(), { wrapper });
    await waitFor(() => expect(result.current).toBe(false));
  });

  it("is true once the migration has run", async () => {
    response = { error: null, status: 200 };
    const { result } = renderHook(() => useSchoolsReady(), { wrapper });
    await waitFor(() => expect(result.current).toBe(true));
  });
});
