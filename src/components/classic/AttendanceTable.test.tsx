import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { AttendanceTable } from "./AttendanceTable";
import { computeRows } from "@/lib/classic/report";
import { normaliseBlob } from "@/lib/classic/blob";
import { sessionsSorted } from "@/lib/classic/months";

/*
 * The attendance grid, which is where the register is actually read.
 *
 * Two things are pinned. First that each of the four cell states reaches the DOM
 * as its own class, because those classes are the entire difference between a
 * tick, a blank, an "e" and a dash once the stylesheet is applied — jsdom cannot
 * see the colours, but a wrong class would be invisible in a screenshot too.
 *
 * Second, that a cell OUTSIDE a trainee's active window cannot be toggled. That
 * is the rule the adjusted percentage rests on: a teaching day held while
 * somebody had already CCT'd counts towards neither figure, and letting a stray
 * click mark them present would quietly corrupt the year.
 */

const blob = normaliseBlob({
  trainees: [
    { id: "t1", name: "Alice Adams", grade: "ST5" },
    { id: "t2", name: "Bo Brown", grade: "ST3" },
  ],
  sessions: [
    { id: "s1", month: "2025-09", title: "Airway" },
    { id: "s2", month: "2025-10", title: "Otology" },
  ],
  attendance: { "t1|s1": { grade: "ST5" } },
  excused: [{ id: "e1", trainee: "t1", session: "s2", reason: "Annual Leave", ts: "2025-10-01" }],
  // Bo left the deanery before either teaching day, so both of Bo's cells are
  // outside the window and must be inert.
  status: [{ id: "st1", trainee: "t2", type: "idt_out", start: "2025-08", end: null }],
});

const sessions = sessionsSorted(blob.sessions);

function renderTable(onToggle = vi.fn()) {
  const { rows } = computeRows(blob, sessions, { hideNotInProgramme: false });
  const result = render(
    <AttendanceTable
      blob={blob}
      rows={rows}
      sessions={sessions}
      sortKey="name"
      sortDir={1}
      onSort={() => {}}
      onToggle={onToggle}
      emptyMessage="nothing here"
    />,
  );
  return { ...result, onToggle };
}

describe("AttendanceTable", () => {
  it("gives each cell state its own class", () => {
    const { container } = renderTable();
    // Alice: present at s1, excused from s2. Bo: not eligible for either.
    expect(container.querySelectorAll(".dot.present")).toHaveLength(1);
    expect(container.querySelectorAll(".dot.excused")).toHaveLength(1);
    expect(container.querySelectorAll(".dot.na")).toHaveLength(2);
  });

  it("shows the trainee, their grade and both percentages", () => {
    renderTable();
    expect(screen.getByText("Alice Adams")).toBeInTheDocument();
    // Alice attended 1 of 2, but was excused from the other, so adjusted is 100%
    // where raw is 50%. That gap is the whole reason the register exists.
    expect(screen.getByText("50%")).toBeInTheDocument();
    expect(screen.getByText("100%")).toBeInTheDocument();
  });

  it("toggles a cell inside the trainee's window", () => {
    const { container, onToggle } = renderTable();
    fireEvent.click(container.querySelector(".dot.present")!);
    expect(onToggle).toHaveBeenCalledWith("t1", "s1");
  });

  it("refuses to toggle a cell outside the trainee's window", () => {
    const { container, onToggle } = renderTable();
    for (const dot of container.querySelectorAll(".dot.na")) {
      fireEvent.click(dot);
    }
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("explains a cell before changing it when the press came from a finger", () => {
    // The first tap must only open the popover: on a phone the tap that showed
    // a tip also silently flipped the attendance underneath it.
    const { container, onToggle } = renderTable();
    const dot = container.querySelector(".dot.present")!;
    fireEvent.pointerDown(dot, { pointerType: "touch" });
    fireEvent.click(dot);
    expect(onToggle).not.toHaveBeenCalled();
    expect(container.querySelector("#cellPop")).not.toBeNull();
  });

  it("changes the cell on the second, deliberate tap inside the popover", () => {
    const { container, onToggle } = renderTable();
    const dot = container.querySelector(".dot.present")!;
    fireEvent.pointerDown(dot, { pointerType: "touch" });
    fireEvent.click(dot);
    fireEvent.click(screen.getByRole("button", { name: "Mark absent" }));
    expect(onToggle).toHaveBeenCalledWith("t1", "s1");
  });
});
