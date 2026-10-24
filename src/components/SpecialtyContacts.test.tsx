import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Tables } from "@/integrations/supabase/types";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

let role: string = "facilitator";
vi.mock("@/hooks/useUserRole", () => ({
  useUserRole: () => ({ data: role }),
  useCurrentUser: () => ({ data: null }),
}));

import { SpecialtyContacts } from "./SpecialtyContacts";

const specialty = { id: "sp-1", short_name: "ENT", deanery_id: "d-1" };

const contact = (over: Partial<Tables<"contacts">>) => ({
  id: "c", name: "Someone", role: "TPD", category: "tpd", organisation: "Trust",
  email: "x@example.invalid", phone: null, profile_url: null, specialty_id: "sp-1", school_id: null,
  deanery_id: "d-1", archived: false, created_at: "", updated_at: "", ...over,
}) as Tables<"contacts">;

const own = contact({ id: "c-own", name: "ENT TPD" });
const general = contact({ id: "c-all", name: "Deanery office", specialty_id: null });
const school = contact({ id: "c-sch", name: "Head of School", specialty_id: null, school_id: "sch-1" });

function renderTab(canManage: boolean, contacts = [own, general]) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <SpecialtyContacts specialty={specialty} contacts={contacts} canManage={canManage} />
    </QueryClientProvider>,
  );
}

describe("SpecialtyContacts", () => {
  it("offers no editing outside edit mode", () => {
    role = "admin";
    renderTab(false);
    expect(screen.queryByRole("button", { name: /Add contact/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Edit / })).toBeNull();
  });

  it("lets a facilitator edit their specialty's contacts but not the general directory", () => {
    role = "facilitator";
    renderTab(true);
    expect(screen.getByRole("button", { name: /Add contact/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit ENT TPD" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit Deanery office" })).toBeNull();
    expect(screen.getByText(/managed by admins/)).toBeInTheDocument();
  });

  it("lets an admin edit every contact shown", () => {
    role = "admin";
    renderTab(true);
    expect(screen.getByRole("button", { name: "Edit Deanery office" })).toBeInTheDocument();
  });

  it("treats a school contact like a deanery-wide one: shown, labelled, admins only", () => {
    role = "facilitator";
    renderTab(true, [general, school, own]);
    expect(screen.queryByRole("button", { name: "Edit Head of School" })).toBeNull();
    expect(screen.getByText("Shown on every specialty in its school · managed by admins")).toBeInTheDocument();
    // The specialty's own first, then the school's, then the deanery's.
    const names = screen.getAllByRole("heading", { level: 3 }).slice(1).map((h) => h.textContent);
    expect(names).toEqual(["ENT TPD", "Head of School", "Deanery office"]);
  });

  it("invites the first contact when there are none", () => {
    role = "facilitator";
    renderTab(true, []);
    fireEvent.click(screen.getByRole("button", { name: /Add the first contact for ENT/ }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Add a contact");
  });

  it("explains what is missing instead of saving an incomplete contact", () => {
    role = "facilitator";
    renderTab(true);
    fireEvent.click(screen.getByRole("button", { name: /Add contact/ }));
    fireEvent.click(screen.getByRole("button", { name: "Add contact" }));
    expect(screen.getByText("Add their name")).toBeInTheDocument();
    expect(screen.getByText("Add an email address")).toBeInTheDocument();
  });

  it("opens the form filled in when editing", () => {
    role = "facilitator";
    renderTab(true);
    fireEvent.click(screen.getByRole("button", { name: "Edit ENT TPD" }));
    expect(screen.getByLabelText("Full name")).toHaveValue("ENT TPD");
  });
});
