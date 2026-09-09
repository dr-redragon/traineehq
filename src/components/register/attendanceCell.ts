import type { CellState } from "@/lib/register/eligibility";

/**
 * How one attendance cell looks and what it is called.
 *
 * Kept in one place because three things have to agree about it: the mark in
 * the grid, the legend under it, and the popover a phone opens when a cell is
 * tapped. A cell that reads "Missed" in one and "Absent" in another is a cell
 * an organiser has to stop and think about.
 *
 * The original register's marks, kept: a filled moss square for a day attended,
 * clay for one excused, and an empty bordered cell for one missed. Missed is
 * deliberately the quiet one — a row of them reads as a gap in the grid, which
 * is the shape an organiser scans for, and it keeps a page of ordinary absence
 * from becoming a wall of red.
 */
export const CELL: Record<CellState, string> = {
  present: "bg-primary text-primary-foreground hover:bg-primary/85",
  excused: "bg-register-clay-soft text-register-clay-ink hover:brightness-95",
  absent: "border border-border bg-card text-muted-foreground/70 hover:border-primary",
  na: "bg-muted text-muted-foreground/50",
};

export const CELL_MARK: Record<CellState, string> = {
  present: "✓", excused: "E", absent: "·", na: "–",
};

/** The short name, for a tooltip or the popover's own line. */
export const CELL_LABEL: Record<CellState, string> = {
  present: "Attended", excused: "Excused", absent: "Missed", na: "Not eligible",
};

/** The long name, for the legend, where there is room to say why. */
export const CELL_LEGEND: Record<CellState, string> = {
  present: "Attended",
  excused: "Excused",
  absent: "Missed",
  na: "Not eligible (leave, pre-start or post-CCT)",
};

/**
 * The dot beside the state in the popover.
 *
 * A solid disc rather than the cell's own square: at this size the square's
 * border is the only thing distinguishing "missed" from the background, and a
 * bordered dot next to a line of text reads as a bullet point.
 */
export const CELL_DOT: Record<CellState, string> = {
  present: "bg-primary",
  excused: "bg-register-clay",
  absent: "bg-muted-foreground/40",
  na: "bg-muted-foreground/25",
};
