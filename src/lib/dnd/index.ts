/**
 * The app's drag-and-drop.
 *
 * Three pieces: a provider that owns the gesture and the floating preview
 * (`DragProvider`), hooks that let a row take part (`useSortableItem` and the
 * two halves it is made of), and the line that shows where a drop will land
 * (`DropIndicator`). The arithmetic is in `geometry.ts`, on its own and tested.
 *
 * A surface wires it up like this:
 *
 *   <DragProvider axis="vertical" onDrop={handleDrop} onKeyboardMove={move}>
 *     {items.map((item, index) => <Row key={item.id} item={item} index={index} />)}
 *   </DragProvider>
 *
 * and a row like this:
 *
 *   const { ref, dragProps, dropProps, handleProps, edge, isDragging } =
 *     useSortableItem({ id: item.id, index, data: { item } });
 *
 * `onDrop` receives the row that was carried and the gap it was let go over;
 * `moveItems` from `geometry.ts` turns that into the new order.
 */
export { DragProvider, type DragProviderProps } from "./DragProvider";
export { useDragState } from "./context";
export { useDraggable, useDropTarget, useSortableItem } from "./useSortable";
export { DropIndicator } from "./DropIndicator";
export {
  autoScrollStep, distance, edgeForPoint, insertItems, moveItems, slotForEdge,
  type Box, type DragAxis, type DropEdge, type DropMode, type Point,
} from "./geometry";
export type { DragData, DragOver, DragSource, DropEvent } from "./types";
