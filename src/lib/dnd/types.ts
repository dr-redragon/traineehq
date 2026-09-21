import type { Box, DragAxis, DropEdge, DropMode } from "./geometry";

export type { Box, DragAxis, DropEdge, DropMode };

/** Whatever the surface needs to know about a row, carried through the drag. */
export type DragData = Record<string, unknown>;

/** What is in the hand. */
export interface DragSource {
  id: string;
  /**
   * Every id being carried, including `id`.
   *
   * A drive row that is part of a selection drags the whole selection; a lone
   * row drags itself. Surfaces that have no notion of selection see a list of
   * one and can ignore it.
   */
  ids: string[];
  data: DragData;
  /** Where the row was when it was picked up, in viewport coordinates. */
  rect: Box;
}

/** What is under it. */
export interface DragOver {
  id: string;
  data: DragData;
  edge: DropEdge;
  /** The row's position in its list, when it declared one. */
  index?: number;
}

export interface DropEvent {
  source: DragSource;
  /** Null when the pointer was over nothing droppable — the drop is a no-op. */
  over: DragOver | null;
}

/** What a surface registers for each row or region that can be landed on. */
export interface DropRegistration {
  id: string;
  data: DragData;
  mode: DropMode;
  index?: number;
  disabled?: boolean;
  /**
   * Refuses a particular drag. Used for the things a tree cannot survive —
   * a folder dropped inside itself — so the row never lights up as a target
   * you are then told off for using.
   */
  accepts?: (source: DragSource) => boolean;
}
