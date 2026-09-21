import { createContext, useContext } from "react";

import type { DragAxis, DragData, DragOver, DragSource, DropRegistration } from "./types";

/* The wiring between the provider and the hooks, kept in its own module so
   neither has to import the other's component. */

export interface Registration extends DropRegistration {
  node: HTMLElement;
}

/** What a draggable hands over when a press might become a drag. */
export interface DragStartSpec {
  id: string;
  ids: string[];
  data: DragData;
  /** The row itself — what gets dimmed, measured and copied for the preview. */
  node: HTMLElement;
  /** True when the press landed on a dedicated handle, which changes the hold. */
  fromHandle: boolean;
}

export interface DragManager {
  scopeId: string;
  axis: DragAxis;
  registerDrop: (key: string, registration: Registration) => void;
  unregisterDrop: (key: string) => void;
  startPointerDrag: (event: React.PointerEvent, spec: DragStartSpec) => void;
  keyboardMove: (id: string, direction: -1 | 1, data: DragData) => void;
  announce: (message: string) => void;
}

export interface DragState {
  source: DragSource | null;
  over: DragOver | null;
}

/**
 * Two contexts rather than one, and deliberately.
 *
 * The manager never changes for the life of a surface, so rows can hold on to
 * it without re-rendering. The state changes when the row under the pointer
 * changes — a handful of times in a drag — and only rows that read it pay for
 * that. Neither carries the pointer's position: that never reaches React at
 * all.
 */
export const ManagerContext = createContext<DragManager | null>(null);
export const StateContext = createContext<DragState>({ source: null, over: null });

export function useDragManager(): DragManager {
  const manager = useContext(ManagerContext);
  if (!manager) {
    throw new Error("Drag hooks must be used inside a <DragProvider>.");
  }
  return manager;
}

export function useDragState(): DragState {
  return useContext(StateContext);
}
