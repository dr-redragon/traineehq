import { useCallback, useEffect, useRef } from "react";

/**
 * Was the thing that just happened a finger, or a mouse?
 *
 * There is no reliable "is this a touch device" question worth asking — a
 * laptop with a touchscreen is both, and a tablet with a keyboard changes its
 * mind between one interaction and the next. So this does not ask about the
 * device at all: it records what kind of pointer opened the most recent
 * interaction, and lets the caller decide from that, one interaction at a time.
 *
 * `pointerdown` is captured at the document, before any click handler runs, so
 * a handler asking the question already has the answer for its own event.
 *
 * A keyboard press clears it: activating a control with Enter or Space produces
 * a click with no pointer event before it, and it would otherwise be judged by
 * whatever the last finger or mouse did, possibly minutes earlier.
 */
export function useTouchInput(): () => boolean {
  const wasTouch = useRef(false);

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      wasTouch.current = e.pointerType === "touch" || e.pointerType === "pen";
    };
    const onKeyDown = () => { wasTouch.current = false; };

    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, []);

  return useCallback(() => wasTouch.current, []);
}
