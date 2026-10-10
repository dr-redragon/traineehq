import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Tables } from "@/integrations/supabase/types";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/hooks/useUserRole", () => ({ useCurrentUser: () => ({ data: null }) }));
vi.mock("@/components/ResourceViewer", () => ({
  ResourceViewer: ({ open }: { open: boolean }) => (open ? <div role="dialog">viewer</div> : null),
}));

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

/*
 * A file result in the search box lands on the folder that holds it with the
 * file picked out, rather than at the top of the section with the file
 * somewhere underneath.
 */
describe("DriveBrowser search highlight", () => {
  const file = {
    id: "file-1",
    title: "Induction slides",
    subsection_id: "sub-1",
    folder_id: "folder-1",
    resource_type: "pdf",
    sort_order: 0,
    updated_at: "2026-09-01T00:00:00Z",
  } as unknown as Tables<"resources">;

  function renderHighlighted(extra: Partial<React.ComponentProps<typeof DriveBrowser>> = {}) {
    return render(
      <QueryClientProvider client={new QueryClient()}>
        <DriveBrowser
          subsection={subsection}
          specialtyId="spec-1"
          resources={[file]}
          folders={[folder]}
          canManage={false}
          openFolderId="folder-1"
          highlightId="file-1"
          arrivalKey="a"
          {...extra}
        />
      </QueryClientProvider>,
    );
  }

  it("opens the containing folder and marks the file", () => {
    const { container } = renderHighlighted();
    expect(screen.getByRole("navigation", { name: "Folder path" })).toHaveTextContent("Presentations");
    const row = container.querySelector('[data-drive-row="file-1"]');
    expect(row).toHaveAttribute("aria-current", "true");
  });

  it("lets the mark go once the reader clicks a row", () => {
    const { container } = renderHighlighted();
    fireEvent.click(screen.getByText("Induction slides"));
    expect(container.querySelector('[data-drive-row="file-1"]')).not.toHaveAttribute("aria-current");
  });

  it("opens the file when asked, then reports the request as spent", () => {
    const onOpened = vi.fn();
    renderHighlighted({ openHighlighted: true, onOpenedHighlighted: onOpened });
    expect(screen.getByRole("dialog")).toHaveTextContent("viewer");
    expect(onOpened).toHaveBeenCalledTimes(1);
  });
});
