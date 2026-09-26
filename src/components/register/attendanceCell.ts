import type { CellState } from "@/lib/register/eligibility";

/**
 * How one attendance cell looks and what it is called.
 *
 * Kept in one place because three things have to agree about it: the mark in
 * the grid, the legend under it, and the popover a phone opens when a cell is
 * tapped. A cell that reads "Missed" in one and "Absent" in another is a cell
 * an organiser has to stop and think about.
 *
 * Square cells with a mark in every state — never colour alone. A solid ink
 * square for a day attended, an accent tint for one excused, and an empty
 * bordered cell for one missed. Missed is deliberately the quiet one — a row of
 * them reads as a gap in the grid, which is the shape an organiser scans for,
 * and it keeps a page of ordinary absence from becoming a wall of colour. The
 * tint is the accent's, so it follows the person's colour scheme.
 */
export const CELL: Record<CellState, string> = {
  present: "bg-foreground text-background hover:bg-foreground/80",
  excused: "bg-accent-strong text-accent-foreground hover:brightness-95",
  absent: "border-[1.5px] border-border bg-transparent text-muted-foreground hover:border-rule",
  na: "bg-muted text-muted-foreground/60",
  upcoming: "border-[1.5px] border-dashed border-border bg-transparent text-muted-foreground/60 hover:border-rule",
};

export const CELL_MARK: Record<CellState, string> = {
  present: "✓", excused: "E", absent: "·", na: "–", upcoming: "",
};

/** The short name, for a tooltip or the popover's own line. */
export const CELL_LABEL: Record<CellState, string> = {
  present: "Attended", excused: "Excused", absent: "Missed", na: "Not eligible",
  upcoming: "Not held yet",
};

/** The long name, for the legend, where there is room to say why. */
export const CELL_LEGEND: Record<CellState, string> = {
  present: "Attended",
  excused: "Excused",
  absent: "Missed",
  na: "Not eligible (leave, pre-start or post-CCT)",
  upcoming: "Not held yet (counts neither way)",
};

/**
 * The dot beside the state in the popover.
 *
 * A solid disc rather than the cell's own square: at this size the square's
 * border is the only thing distinguishing "missed" from the background, and a
 * bordered dot next to a line of text reads as a bullet point.
 */
export const CELL_DOT: Record<CellState, string> = {
  present: "bg-foreground",
  excused: "bg-rule",
  absent: "bg-muted-foreground/40",
  na: "bg-muted-foreground/25",
  upcoming: "border border-dashed border-muted-foreground/50",
};
