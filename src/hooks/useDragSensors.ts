import {
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";

/**
 * The sensors every drag-and-drop surface in the app uses.
 *
 * `PointerSensor` — what these all used before — covers mouse and touch with
 * one set of rules, and that is exactly why touch never worked. Its distance
 * constraint says "a drag begins once the pointer has moved 5px", which on a
 * touch screen is indistinguishable from the beginning of a scroll: the browser
 * takes the gesture for scrolling, cancels the pointer stream, and the drag
 * dies before it starts. On a phone the widgets simply would not move.
 *
 * Splitting the two lets each have the rule that suits it:
 *
 * - Mouse keeps distance activation, so a click is still a click and a small
 *   wobble does not start dragging things around.
 * - Touch activates on a delay instead — press and hold, then drag. Holding
 *   still is the one gesture a phone cannot confuse with a scroll, which is
 *   what makes it the conventional way to pick something up. `tolerance` is
 *   how far a finger may stray during the hold before the gesture is given
 *   back to the page as a scroll, so a swipe still scrolls.
 *
 * A dedicated drag handle should also carry Tailwind's `touch-none`, so the
 * browser never begins scrolling from it and the hold is always heard. Do not
 * put that on a whole draggable row — it would leave a list you cannot scroll.
 */
export function useDragSensors(mouseDistance = 5) {
  return useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: mouseDistance } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );
}
