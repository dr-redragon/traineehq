import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { YearTabs } from "./YearTabs";

/*
 * What is being pinned here is that the year filters carry their state as
 * `aria-pressed` rather than only as a background colour.
 *
 * The bug they were changed for was a phone one: a tapped button keeps :hover
 * until you touch something else, and the hovered-unselected background looked
 * like the selected one, so the row appeared stuck. The hover half of that fix
 * lives in tailwind.config.ts and cannot be seen from jsdom, which loads no
 * stylesheet. This half can: state that a machine — or a screen reader — can
 * read, and which cannot be faked by a hover.
 */

describe("YearTabs", () => {
  const years = ["2024/25", "2025/26"];

  it("marks exactly the chosen year as pressed", () => {
    render(<YearTabs years={years} value="2025/26" onChange={() => {}} />);
    expect(screen.getByRole("button", { name: "2025/26" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "2024/25" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "All years" })).toHaveAttribute("aria-pressed", "false");
  });

  it("reports the year that was chosen", () => {
    const onChange = vi.fn();
    render(<YearTabs years={years} value="2025/26" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "2024/25" }));
    expect(onChange).toHaveBeenCalledWith("2024/25");
  });

  it("offers 'All years' only when there is more than one", () => {
    const { rerender } = render(<YearTabs years={["2025/26"]} value="2025/26" onChange={() => {}} />);
    expect(screen.queryByRole("button", { name: "All years" })).toBeNull();
    rerender(<YearTabs years={years} value="2025/26" onChange={() => {}} />);
    expect(screen.getByRole("button", { name: "All years" })).toBeTruthy();
  });
});
