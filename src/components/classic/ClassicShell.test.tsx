import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ClassicShell } from "./ClassicShell";

/*
 * What is pinned here is the copy's SHELL, and the reason it matters is that the
 * whole point of this register is that it looks like the standalone one.
 *
 * Its stylesheet is that register's stylesheet with every selector prefixed by
 * `.classic-register`. So the wrapper class is not decoration: without it not a
 * single rule matches and the page renders as unstyled HTML in the middle of
 * TraineeHQ. jsdom loads no stylesheet and cannot see the palette, but it can
 * see whether the hook the palette hangs off is present, and whether the markup
 * still uses the class names the stylesheet is written against.
 */

const tabs = [
  { id: "dash", label: "Attendance" },
  { id: "checkin", label: "Check-in / QR" },
];

function renderShell(props: Partial<Parameters<typeof ClassicShell>[0]> = {}) {
  return render(
    <MemoryRouter>
      <ClassicShell tabs={tabs} activeTab="dash" {...props}>
        <p>panel body</p>
      </ClassicShell>
    </MemoryRouter>,
  );
}

describe("ClassicShell", () => {
  it("scopes the page under .classic-register, or none of the stylesheet applies", () => {
    const { container } = renderShell();
    expect(container.querySelector(".classic-register")).not.toBeNull();
  });

  it("keeps the class names the ported stylesheet is written against", () => {
    const { container } = renderShell();
    // These four carry the masthead, the gold rule and the sticky tab bar.
    expect(container.querySelector("header .masthead-row")).not.toBeNull();
    expect(container.querySelector(".brand .mark")).not.toBeNull();
    expect(container.querySelector("nav .tabs")).not.toBeNull();
    expect(container.querySelector(".tab.active")).not.toBeNull();
  });

  it("marks exactly the open tab as pressed", () => {
    renderShell();
    expect(screen.getByRole("button", { name: "Attendance" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Check-in / QR" })).toHaveAttribute("aria-pressed", "false");
  });

  it("reports the tab that was chosen", () => {
    const onTabChange = vi.fn();
    renderShell({ onTabChange });
    fireEvent.click(screen.getByRole("button", { name: "Check-in / QR" }));
    expect(onTabChange).toHaveBeenCalledWith("checkin");
  });

  it("offers the way back to TraineeHQ and a Sign out, as the live register does", () => {
    renderShell();
    expect(screen.getByRole("link", { name: "Back to TraineeHQ" })).toHaveAttribute("href", "/dashboard");
    expect(screen.getByRole("button", { name: "Sign out" })).toBeInTheDocument();
  });

  it("offers a switcher only once there are two registers to switch between", () => {
    const entry = {
      id: "r1", name: "NW · ENT", slug: "nw-ent", deanery_name: "North West", specialty_name: "ENT",
      member_count: 2, i_am_member: true, i_am_owner: true, certificate_logo_path: null, my_request: null,
    };
    const { unmount } = renderShell({ registers: [entry], currentSlug: "nw-ent" });
    expect(screen.queryByRole("combobox", { name: "Switch register" })).toBeNull();
    unmount();

    renderShell({
      registers: [entry, { ...entry, id: "r2", slug: "nw-uro", specialty_name: "Urology" }],
      currentSlug: "nw-ent",
    });
    const select = screen.getByRole("combobox", { name: "Switch register" });
    expect(select).toHaveValue("nw-ent");
    expect(screen.getByRole("option", { name: "North West · Urology" })).toBeInTheDocument();
  });
});
