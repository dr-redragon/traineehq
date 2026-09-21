import { useCallback, useEffect, useRef } from "react";

import { useDragManager, useDragState, type DragStartSpec } from "./context";
import type { DragData, DropEdge, DropMode } from "./types";

/* The hooks a surface actually reaches for. Between them and the provider
   there is nothing else: a row says what it is, what it carries and what it
   will accept, and gets back the props to spread and the two booleans it needs
   to draw itself. */

export interface DraggableOptions {
  id: string;
  data?: DragData;
  /**
   * The other ids that travel with this one — a selection, usually. The row's
   * own id is added if it is missing, so a surface can pass its selection
   * straight through.
   */
  group?: string[];
  disabled?: boolean;
  /** Read out when the row is picked up or moved from the keyboard. */
  label?: string;
}

export interface DraggableResult {
  setNodeRef: (node: HTMLElement | null) => void;
  /**
   * Always spread on the row. It is what the engine measures, copies for the
   * preview and dims while the row is in the hand — none of which depends on
   * whether the row drags by its whole self or by a handle.
   */
  itemProps: {
    "data-dnd-item": string;
    "data-dnd-scope": string;
    "data-dragging"?: string;
  };
  /** Spread on the row *as well*, when the whole of it should be draggable. */
  dragProps: {
    onPointerDown: (event: React.PointerEvent) => void;
  };
  /** Spread on a dedicated handle instead — a grip, a button in the gutter. */
  handleProps: {
    onPointerDown: (event: React.PointerEvent) => void;
    onKeyDown: (event: React.KeyboardEvent) => void;
    "data-dnd-handle": string;
    tabIndex: number;
    role: string;
    "aria-label"?: string;
  };
  isDragging: boolean;
}

/**
 * Presses that are somebody else's.
 *
 * A row can hold buttons, menus, checkboxes and links, and pressing one of
 * those is never the start of a drag — on a phone especially, where the hold
 * that picks a row up is also how you mean to press and wait on a control.
 */
const INTERACTIVE = "button, a, input, select, textarea, label, [role='button'], [role='menuitem'], [data-no-drag]";

export function useDraggable({ id, data, group, disabled, label }: DraggableOptions): DraggableResult {
  const manager = useDragManager();
  const { source } = useDragState();
  const nodeRef = useRef<HTMLElement | null>(null);

  const setNodeRef = useCallback((node: HTMLElement | null) => {
    nodeRef.current = node;
  }, []);

  const begin = useCallback((event: React.PointerEvent, fromHandle: boolean) => {
    if (disabled) return;
    const node = nodeRef.current;
    if (!node) return;

    const target = event.target as HTMLElement | null;
    if (!fromHandle && target?.closest(INTERACTIVE)) return;

    const spec: DragStartSpec = {
      id,
      ids: group?.length ? group : [id],
      data: data ?? {},
      node,
      fromHandle,
    };
    manager.startPointerDrag(event, spec);
  }, [data, disabled, group, id, manager]);

  const onKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (disabled) return;
    const back = manager.axis === "vertical" ? "ArrowUp" : "ArrowLeft";
    const forward = manager.axis === "vertical" ? "ArrowDown" : "ArrowRight";
    if (event.key !== back && event.key !== forward) return;
    event.preventDefault();
    // A rail of tabs answers the arrow keys too; this one is the handle's.
    event.stopPropagation();
    const direction = event.key === back ? -1 : 1;
    manager.keyboardMove(id, direction, data ?? {});
    manager.announce(`${label ?? "Item"} moved ${direction === 1 ? "down" : "up"}.`);
  }, [data, disabled, id, label, manager]);

  const isDragging = !!source && source.ids.includes(id);

  return {
    setNodeRef,
    itemProps: {
      "data-dnd-item": id,
      "data-dnd-scope": manager.scopeId,
      ...(isDragging ? { "data-dragging": "true" } : {}),
    },
    dragProps: {
      onPointerDown: (event) => begin(event, false),
    },
    handleProps: {
      onPointerDown: (event) => begin(event, true),
      onKeyDown,
      "data-dnd-handle": "",
      tabIndex: disabled ? -1 : 0,
      role: "button",
      ...(label ? { "aria-label": label } : {}),
    },
    isDragging,
  };
}

export interface DropTargetOptions {
  id: string;
  data?: DragData;
  /** Where on this target a drop means what. See `DropMode`. */
  mode?: DropMode;
  /** Its position in its list, for surfaces that reorder. */
  index?: number;
  disabled?: boolean;
  accepts?: (source: { id: string; ids: string[]; data: DragData }) => boolean;
}

export interface DropTargetResult {
  setNodeRef: (node: HTMLElement | null) => void;
  dropProps: {
    "data-dnd-target": string;
    "data-dnd-scope": string;
    "data-drop-edge"?: DropEdge;
  };
  /** Which side of this row the pointer is on, or null when it is elsewhere. */
  edge: DropEdge | null;
  isOver: boolean;
}

export function useDropTarget({
  id, data, mode = "between", index, disabled, accepts,
}: DropTargetOptions): DropTargetResult {
  const manager = useDragManager();
  const { over } = useDragState();
  const nodeRef = useRef<HTMLElement | null>(null);

  // Re-registered on every render: the data, the index and whether it is
  // disabled all change as the list does, and a stale registration is a row
  // that accepts drops on behalf of a row that has moved.
  const latest = useRef({ id, data, mode, index, disabled, accepts });
  latest.current = { id, data, mode, index, disabled, accepts };

  const setNodeRef = useCallback((node: HTMLElement | null) => {
    nodeRef.current = node;
  }, []);

  useEffect(() => {
    const node = nodeRef.current;
    if (!node) return;
    const { data: d, mode: m, index: i, disabled: off, accepts: a } = latest.current;
    manager.registerDrop(id, { id, node, data: d ?? {}, mode: m, index: i, disabled: off, accepts: a });
  });

  useEffect(() => () => manager.unregisterDrop(id), [id, manager]);

  const isOver = over?.id === id;

  return {
    setNodeRef,
    dropProps: {
      "data-dnd-target": id,
      "data-dnd-scope": manager.scopeId,
      ...(isOver && over ? { "data-drop-edge": over.edge } : {}),
    },
    edge: isOver && over ? over.edge : null,
    isOver,
  };
}

export type SortableOptions = DraggableOptions & Omit<DropTargetOptions, "id"> & {
  /**
   * Stops the row accepting drops while it still offers itself for dragging.
   *
   * The drive needs this while a column sort is on: the positions on screen
   * are then a temporary view rather than the arranged order, so there is no
   * gap beside a row that means anything — but the row can still be picked up
   * and carried into a folder.
   */
  dropDisabled?: boolean;
};

export interface SortableResult extends Omit<DraggableResult, "setNodeRef"> {
  /** One ref for the row: it is both the thing you pick up and a place to land. */
  ref: (node: HTMLElement | null) => void;
  edge: DropEdge | null;
  isOver: boolean;
  /** Spread on the row alongside `dragProps` when the row drags by a handle. */
  dropProps: DropTargetResult["dropProps"];
}

/**
 * A row that is both draggable and droppable, which is what a sortable list is.
 */
export function useSortableItem(options: SortableOptions): SortableResult {
  const { id, data, group, disabled, label, mode, index, accepts, dropDisabled } = options;
  const {
    setNodeRef: setDragRef, itemProps, dragProps, handleProps, isDragging,
  } = useDraggable({ id, data, group, disabled, label });
  const {
    setNodeRef: setDropRef, dropProps, edge, isOver,
  } = useDropTarget({ id, data, mode, index, disabled: disabled || dropDisabled, accepts });

  const ref = useCallback((node: HTMLElement | null) => {
    setDragRef(node);
    setDropRef(node);
  }, [setDragRef, setDropRef]);

  return { ref, itemProps, dragProps, handleProps, isDragging, dropProps, edge, isOver };
}
