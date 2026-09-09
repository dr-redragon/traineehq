import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { AttendanceGrid } from "./AttendanceGrid";
import { EMPTY_REGISTER, type RegisterBlob } from "@/lib/register/types";

/*
 * What is pinned here is the difference between a mouse and a finger.
 *
 * On a desktop a click on an attendance cell has always changed it, and that
 * stays: an organiser marking a register wants one click per person. On a phone
 * there is no hover, so the same tap both hid the detail a mouse gets for free
 * and silently rewrote somebody's attendance on a 28px target. A tap therefore
 * opens the detail and changes nothing; changing it takes a second, deliberate
 * press on a button that says what it will do.
 *
 * jsdom loads no stylesheet and has no layout, so none of this can be asserted
 * from appearance. It is asserted from what the two inputs actually do.
 */

const february = { id: "s1", month: "2026-02", title: "February teaching" };

const blob: RegisterBlob = {
  ...EMPTY_REGISTER,
  trainees: [
    { id: "t1", name: "Alice Adeyemi", grade: "ST6" },
    { id: "t2", name: "Bo Chen" },
  ],
  sessions: [february],
  attendance: { "t1|s1": { grade: "ST6" } },
  // Bo is on leave across this teaching day, so their cell is a derived fact
  // rather than a mark: not theirs to attend, and not changeable here. Leave
  // rather than CCT because the grid hides former trainees by default, and a
  // row that is not on screen cannot be tapped.
  status: [{ id: "st1", trainee: "t2", type: "mat", start: "2026-01", end: "2026-06" }],
};

function grid(overrides: Partial<Parameters<typeof AttendanceGrid>[0]> = {}) {
  const onEdit = vi.fn();
  const onToggle = vi.fn();
  render(
    <AttendanceGrid
      blob={blob} sessions={[february]} onEdit={onEdit} canEdit onToggle={onToggle}
      {...overrides}
    />,
  );
  return { onEdit, onToggle };
}

/** The cell buttons carry the whole detail as their accessible name. */
const cell = (name: RegExp) => screen.getByRole("button", { name });

const tap = (el: Element) => {
  fireEvent.pointerDown(el, { pointerType: "touch" });
  fireEvent.click(el);
};

/**
 * The popover arms its dismissal a frame after it opens, so that the tap which
 * opened it cannot also close it. Anything testing dismissal has to let that
 * frame pass first.
 */
const settle = () => act(async () => {
  await new Promise((resolve) => requestAnimationFrame(resolve));
});

const clickWithMouse = (el: Element) => {
  fireEvent.pointerDown(el, { pointerType: "mouse" });
  fireEvent.click(el);
};

describe("AttendanceGrid cells", () => {
  it("names the trainee, the teaching day, the state and the grade", () => {
    grid();
    expect(cell(/Alice Adeyemi — February teaching \(Feb 2026\) · Attended · ST6/)).toBeTruthy();
    expect(cell(/Bo Chen — February teaching \(Feb 2026\) · Not eligible/)).toBeTruthy();
  });

  it("changes the mark on a mouse click, with no popover in the way", () => {
    const { onEdit, onToggle } = grid();
    clickWithMouse(cell(/Alice Adeyemi/));

    expect(onEdit).toHaveBeenCalledTimes(1);
    // Alice was present, so the click makes her absent.
    expect(onToggle).toHaveBeenCalledWith("t1", "s1", false);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens the details on a tap and changes nothing", () => {
    const { onEdit, onToggle } = grid();
    tap(cell(/Alice Adeyemi/));

    expect(onEdit).not.toHaveBeenCalled();
    expect(onToggle).not.toHaveBeenCalled();

    // Asked of the popover rather than the page: "Feb 2026" is the column
    // heading too, and the point of the popover is that it names the day.
    const details = within(screen.getByRole("dialog"));
    expect(details.getByText("February teaching")).toBeTruthy();
    expect(details.getByText("Feb 2026")).toBeTruthy();
    expect(details.getByText(/Attended · ST6/)).toBeTruthy();
  });

  it("changes the mark from the popover's own button, and closes", () => {
    const { onEdit, onToggle } = grid();
    tap(cell(/Alice Adeyemi/));

    fireEvent.click(screen.getByRole("button", { name: "Mark absent" }));

    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onToggle).toHaveBeenCalledWith("t1", "s1", false);
    expect(screen.queryByRole("button", { name: "Mark absent" })).toBeNull();
  });

  it("offers to mark somebody attended when they are not", () => {
    grid({
      blob: { ...blob, attendance: {} },
    });
    tap(cell(/Alice Adeyemi/));
    expect(screen.getByRole("button", { name: "Mark attended" })).toBeTruthy();
  });

  it("closes on Close without changing anything", () => {
    const { onEdit } = grid();
    tap(cell(/Alice Adeyemi/));
    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(onEdit).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Mark absent" })).toBeNull();
  });

  it("closes on a tap outside, changing nothing", async () => {
    const { onEdit } = grid();
    tap(cell(/Alice Adeyemi/));
    await settle();

    fireEvent.pointerDown(document.body, { pointerType: "touch" });

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(onEdit).not.toHaveBeenCalled();
  });

  it("closes on Escape", async () => {
    grid();
    tap(cell(/Alice Adeyemi/));
    await settle();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("closes rather than reopening when the same cell is tapped again", async () => {
    grid();
    const alice = cell(/Alice Adeyemi/);
    tap(alice);
    await settle();

    // The tap that dismisses the popover lands on the cell underneath as well;
    // without the guard for it the cell would close and immediately reopen.
    tap(alice);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("explains a cell that is not theirs to attend, and offers no way to flip it", () => {
    const { onEdit } = grid();
    tap(cell(/Bo Chen/));

    expect(within(screen.getByRole("dialog"))
      .getByText(/Not in the programme for this teaching day/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Mark / })).toBeNull();
    expect(onEdit).not.toHaveBeenCalled();
  });

  it("ignores a mouse click on a cell that is not theirs to attend", () => {
    const { onEdit, onToggle } = grid();
    clickWithMouse(cell(/Bo Chen/));

    expect(onEdit).not.toHaveBeenCalled();
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("still shows a read-only viewer what a cell means, without letting them change it", () => {
    const { onEdit } = grid({ canEdit: false });
    tap(cell(/Alice Adeyemi/));

    expect(screen.getByText("February teaching")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Mark absent" })).toBeDisabled();
    expect(onEdit).not.toHaveBeenCalled();
  });
});
