import { createContext, type MutableRefObject, type ReactNode } from "react";

import type { DragSource, DropEvent } from "@/lib/dnd";

/**
 * One drag surface for a whole specialty page, rather than one per file list.
 *
 * The drive used to own its drag provider outright, which is why a file could
 * go anywhere inside its own category and nowhere else: the category rail sat
 * in a different provider, and a drag only ever sees the targets of the
 * provider it began in. Putting the rail and the open category's drive under
 * one provider is what lets a file be dropped onto another category's name.
 *
 * The page owns that provider; the drive, which holds the selection and the
 * folders and so knows what a drop means, hands its handlers up through this
 * ref. A drive rendered with no host — a test, or anywhere else it is reused —
 * falls back to a provider of its own and behaves as it always did.
 */
export interface DriveDragHandlers {
  onDrop: (event: DropEvent) => void;
  onDragStart: (source: DragSource) => void;
  renderPreview: (source: DragSource) => ReactNode;
}

export const DriveDragHostContext =
  createContext<MutableRefObject<DriveDragHandlers | null> | null>(null);

/** A category being dragged around the rail, as opposed to something from the drive. */
export const isSectionDrag = (source: { data: Record<string, unknown> }) =>
  source.data.kind === "section";

/** Files and folders: the things a category tab can take in. */
export const isDriveDrag = (source: { data: Record<string, unknown> }) =>
  source.data.kind === "file" || source.data.kind === "folder";
