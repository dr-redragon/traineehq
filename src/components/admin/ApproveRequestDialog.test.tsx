import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/hooks/useUserRole", () => ({ useUserRole: () => ({ data: "admin" }) }));

import { ApproveRequestDialog } from "./ApproveRequestDialog";

const deaneries = [{ id: "d-1", name: "North West" }];
const specialties = [
  { id: "s-ent", short_name: "ENT", deanery_id: "d-1", is_active: true, parent_specialty_id: null },
  { id: "s-uro", short_name: "Urology", deanery_id: "d-1", is_active: true, parent_specialty_id: null },
];
const request = {
  id: "r-1", first_name: "Jane", last_name: "Doe", email: "jane@nhs.net",
  specialty_id: "s-ent", deanery_id: "d-1", register_id: null,
};

function renderDialog(onApprove = vi.fn()) {
  // Seeded and never stale, so nothing reaches the (absent) database.
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
  client.setQueryData(["approval-deaneries"], deaneries);
  client.setQueryData(["approval-specialties"], specialties);
  render(
    <QueryClientProvider client={client}>
      <ApproveRequestDialog request={request} open onOpenChange={() => {}} onApprove={onApprove} approving={false} />
    </QueryClientProvider>,
  );
  return onApprove;
}

describe("ApproveRequestDialog", () => {
  it("starts from what they asked for", () => {
    const onApprove = renderDialog();
    fireEvent.click(screen.getByRole("button", { name: /Approve and send/ }));
    expect(onApprove).toHaveBeenCalledWith({ role: "trainee", deanery_id: "d-1", specialty_ids: ["s-ent"] });
  });

  it("approves with the specialties the admin changes to", () => {
    const onApprove = renderDialog();
    fireEvent.click(screen.getByRole("checkbox", { name: /Urology/ }));
    expect(screen.getByRole("button", { name: /Use what they asked for/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Approve and send/ }));
    expect(onApprove).toHaveBeenCalledWith({ role: "trainee", deanery_id: "d-1", specialty_ids: ["s-ent", "s-uro"] });
  });
});
