import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Tables } from "@/integrations/supabase/types";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { DriveBrowser } from "./DriveBrowser";

/*
 * Opening a folder draws the breadcrumb, and every crumb is a drop target. The
 * drag provider once wrapped only the list, so the first crumb to appear threw
 * "Drag hooks must be used inside a <DragProvider>" and took the whole
 * specialty page down with it. The root has no trail, so nothing showed until
 * a folder was clicked.
 */

const subsection = { id: "sub-1", name: "Calman day" } as Tables<"subsections">;
const folder = {
  id: "folder-1",
  name: "Presentations",
  subsection_id: "sub-1",
  parent_folder_id: null,
  sort_order: 0,
  updated_at: "2026-09-01T00:00:00Z",
} as Tables<"resource_folders">;

function renderBrowser(canManage: boolean) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <DriveBrowser
        subsection={subsection}
        specialtyId="spec-1"
        resources={[]}
        folders={[folder]}
        canManage={canManage}
      />
    </QueryClientProvider>,
  );
}

describe("DriveBrowser", () => {
  it.each([false, true])("opens a folder when it is clicked (canManage: %s)", (canManage) => {
    renderBrowser(canManage);
    fireEvent.click(screen.getByText("Presentations"));

    const trail = screen.getByRole("navigation", { name: "Folder path" });
    expect(trail).toHaveTextContent("Calman day");
    expect(trail).toHaveTextContent("Presentations");
    expect(screen.getByRole("button", { name: "Up one level" })).toBeInTheDocument();
  });
});
