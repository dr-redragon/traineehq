import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { SpecialtyNoticeBoard } from "./SpecialtyNoticeBoard";

const notice = (id: string, content: string) => ({
  id, content, specialty_id: "sp-1", author_id: "u-1", created_at: "2026-10-01T00:00:00Z", is_active: true,
});

function renderBoard(notices: ReturnType<typeof notice>[]) {
  // Seeded and never stale, so nothing reaches the (absent) database.
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
  client.setQueryData(["specialty-notices", "sp-1"], notices);
  client.setQueryData(["profiles-map"], []);
  client.setQueryData(["current-user"], null);
  return render(
    <QueryClientProvider client={client}>
      <SpecialtyNoticeBoard specialtyId="sp-1" canManage={false} />
    </QueryClientProvider>,
  );
}

/*
 * On a phone the notices fold into one bar showing how many there are. jsdom
 * applies no media queries, so this checks the classes that do the hiding:
 * `hidden sm:block` is folded on a phone and always open from sm up.
 */
describe("SpecialtyNoticeBoard on a phone", () => {
  it("folds the notices behind a bar with a count, and opens and closes it", () => {
    renderBoard([notice("n1", "Rota out"), notice("n2", "Exam dates")]);
    const bar = screen.getByRole("button", { name: /Notices/ });
    const list = document.getElementById("notices-sp-1")!;

    expect(bar).toHaveTextContent("2");
    expect(bar).toHaveTextContent("Show");
    expect(bar).toHaveAttribute("aria-expanded", "false");
    expect(list).toHaveClass("hidden", "sm:block");

    fireEvent.click(bar);
    expect(bar).toHaveTextContent("Hide");
    expect(bar).toHaveAttribute("aria-expanded", "true");
    expect(list).not.toHaveClass("hidden");
    expect(list).toHaveTextContent("Exam dates");

    fireEvent.click(bar);
    expect(list).toHaveClass("hidden");
  });

  it("shows no bar when there are no notices", () => {
    renderBoard([]);
    expect(screen.queryByRole("button", { name: /Notice/ })).toBeNull();
  });
});
