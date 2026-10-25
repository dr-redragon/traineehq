import { describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

let response: { error: unknown; status: number };
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => ({ select: () => ({ limit: async () => response }) }) },
}));

import { usePagesReady } from "./usePagesReady";

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
);

describe("usePagesReady", () => {
  it("is false while the column is missing", async () => {
    response = { error: { message: "column specialties.page_layout does not exist" }, status: 400 };
    const { result } = renderHook(() => usePagesReady(), { wrapper });
    await waitFor(() => expect(result.current).toBe(false));
  });

  it("is true once the migration has run", async () => {
    response = { error: null, status: 200 };
    const { result } = renderHook(() => usePagesReady(), { wrapper });
    await waitFor(() => expect(result.current).toBe(true));
  });
});
