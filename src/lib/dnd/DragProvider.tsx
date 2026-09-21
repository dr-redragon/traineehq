import {
  useCallback, useEffect, useId, useMemo, useRef, useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import {
  ManagerContext, StateContext,
  type DragManager, type DragStartSpec, type DragState, type Registration,
} from "./context";

import {
  AUTO_SCROLL, autoScrollStep, distance, edgeForPoint,
  type Box, type DragAxis, type DropEdge, type Point,
} from "./geometry";
import type { DragData, DragOver, DragSource, DropEvent } from "./types";

/* ------------------------------------------------------------------ *
 * The engine.
 *
 * WHY THIS EXISTS RATHER THAN A LIBRARY'S. The previous mechanism drew the
 * thing you were dragging inside the React tree and moved it by re-rendering a
 * transform on every pointer event, from rectangles it had measured when the
 * drag began. Three separate things make that drift away from your finger:
 * React batches, so the preview is always a frame or more behind the pointer;
 * a `position: fixed` overlay is only fixed to the viewport if no ancestor has
 * a transform or a filter, and this app has plenty; and cached rectangles stop
 * describing the page the moment anything scrolls underneath. Together they
 * are exactly the complaint — the item slides away from the cursor, and by the
 * time you let go it lands somewhere else again.
 *
 * So this design removes all three rather than tuning them:
 *
 * 1. THE PREVIEW NEVER GOES THROUGH REACT. It is one element, portalled to
 *    `document.body` so nothing can re-parent it into a transformed ancestor,
 *    and its transform is written directly in a requestAnimationFrame loop from
 *    the last raw pointer coordinate. Client coordinates in, viewport
 *    coordinates out, one frame, no state.
 *
 * 2. NOTHING IS MEASURED IN ADVANCE. What you are over is answered by
 *    `document.elementsFromPoint` on the live page, every frame the pointer or
 *    the scroll moves. It cannot go stale, it is correct through scrolling,
 *    zooming, nesting and animation, and it costs about what a hover costs.
 *
 * 3. REACT IS TOLD ONLY WHAT CHANGES. State updates when the row under the
 *    pointer or the side of it changes — a handful of times per drag — not
 *    sixty times a second.
 *
 * Mouse, touch and pen arrive through one Pointer Events pipeline, so there is
 * a single set of rules to reason about, with one deliberate difference: what
 * counts as "you meant to drag this". See `beginPending`.
 * ------------------------------------------------------------------ */

/** Pixels a mouse must travel before a press becomes a drag rather than a click. */
const MOUSE_THRESHOLD = 4;
/** How long a finger must rest on a row before it picks up. */
const TOUCH_HOLD_MS = 320;
/** The same, on a dedicated handle: the handle has already said what it is for. */
const HANDLE_HOLD_MS = 110;
/** How far a finger may stray during the hold before the gesture is read as a scroll. */
const TOUCH_TOLERANCE = 10;

export type { DragStartSpec } from "./context";

export interface DragProviderProps {
  children: ReactNode;
  /** Which way this surface's lists run. Tabs in a rail are the horizontal case. */
  axis?: DragAxis;
  /** Called once, when the pointer is released over something that accepts it. */
  onDrop: (event: DropEvent) => void;
  onDragStart?: (source: DragSource) => void;
  onDragCancel?: () => void;
  /**
   * The thing that follows the pointer. Left out, the row itself is cloned,
   * which is nearly always the right answer and always the honest one.
   */
  renderPreview?: (source: DragSource) => ReactNode;
  /**
   * Arrow keys on a focused handle. The same reorder, without a pointer — and
   * the only way any of this is reachable from a keyboard at all.
   */
  onKeyboardMove?: (id: string, direction: -1 | 1, data: DragData) => void;
}

/**
 * One surface that things can be dragged around.
 *
 * Provide one per area with its own rules — the dashboard, a drive listing, a
 * rail of tabs. They do not nest and do not need to: each only ever responds to
 * a press that began on one of its own rows.
 */
export function DragProvider({
  children, axis = "vertical", onDrop, onDragStart, onDragCancel, renderPreview, onKeyboardMove,
}: DragProviderProps) {
  const scopeId = useId();
  const [state, setState] = useState<DragState>({ source: null, over: null });
  const [message, setMessage] = useState("");

  const registry = useRef(new Map<string, Registration>()).current;

  /* The live drag. All of it is refs: a drag is a stream of events between two
     renders, and putting any of it in state is what puts the preview a frame
     behind the finger. */
  const pending = useRef<{
    pointerId: number;
    origin: Point;
    spec: DragStartSpec;
    touch: boolean;
    timer: number | null;
  } | null>(null);

  const drag = useRef<{
    pointerId: number;
    source: DragSource;
    /** The row itself, kept for the preview to copy and for measuring. */
    node: HTMLElement;
    /** Where in the row the pointer took hold, so the preview keeps that grip. */
    grab: Point;
    pointer: Point;
    over: DragOver | null;
    /** Surfaces to creep when the pointer nears their edge, innermost first. */
    scrollers: (HTMLElement | Window)[];
    frame: number | null;
    dirty: boolean;
  } | null>(null);

  const ghostRef = useRef<HTMLDivElement | null>(null);

  // Callbacks are read through a ref so the pointer pipeline never has to be
  // torn down and rebuilt mid-drag when a parent re-renders.
  const handlers = useRef({ onDrop, onDragStart, onDragCancel, onKeyboardMove });
  handlers.current = { onDrop, onDragStart, onDragCancel, onKeyboardMove };

  const announce = useCallback((text: string) => setMessage(text), []);

  /**
   * Whether the click that follows the pointer going up should be swallowed.
   *
   * A mouse drag ends with a `click` on whatever is underneath, and on a row
   * that opens a file that would mean every rearrangement also opened
   * something. Cleared on the next press, so an ordinary click is never eaten.
   */
  const suppressClick = useRef(false);

  const registerDrop = useCallback((key: string, registration: Registration) => {
    registry.set(key, registration);
  }, [registry]);

  const unregisterDrop = useCallback((key: string) => {
    registry.delete(key);
  }, [registry]);

  /* ---------- Hit testing ---------- */

  /**
   * What the pointer is over, asked of the page as it is right now.
   *
   * `elementsFromPoint` hands back the whole stack under the point, innermost
   * first, so the first registered target in it is the most specific one — a
   * folder row wins over the list it sits in without either having to know
   * about the other.
   */
  const hitTest = useCallback((point: Point, source: DragSource): DragOver | null => {
    const stack = document.elementsFromPoint(point.x, point.y);
    for (const element of stack) {
      if (!(element instanceof HTMLElement)) continue;
      const key = element.dataset.dndTarget;
      if (!key || element.dataset.dndScope !== scopeId) continue;

      const registration = registry.get(key);
      if (!registration || registration.disabled) continue;
      // A row being carried is not somewhere to put it.
      if (source.ids.includes(registration.id)) continue;
      if (registration.accepts && !registration.accepts(source)) continue;

      const rect = element.getBoundingClientRect();
      const edge = edgeForPoint(rect, point, axis, registration.mode);
      return { id: registration.id, data: registration.data, edge, index: registration.index };
    }
    return null;
  }, [axis, registry, scopeId]);

  /* ---------- Scrolling ---------- */

  const collectScrollers = useCallback((from: HTMLElement | null): (HTMLElement | Window)[] => {
    const found: (HTMLElement | Window)[] = [];
    let node: HTMLElement | null = from;
    while (node && node !== document.body && node !== document.documentElement) {
      const style = getComputedStyle(node);
      const scrolls = /auto|scroll|overlay/.test(style.overflowY + style.overflowX);
      const canMove = node.scrollHeight > node.clientHeight || node.scrollWidth > node.clientWidth;
      if (scrolls && canMove) found.push(node);
      node = node.parentElement;
    }
    found.push(window);
    return found;
  }, []);

  const autoScroll = useCallback((point: Point) => {
    const current = drag.current;
    if (!current) return;

    for (const scroller of current.scrollers) {
      const box: Box = scroller === window
        ? { top: 0, left: 0, width: window.innerWidth, height: window.innerHeight }
        : (scroller as HTMLElement).getBoundingClientRect();

      const step = autoScrollStep(box, point, AUTO_SCROLL);
      if (step.x === 0 && step.y === 0) continue;

      const before = scroller === window
        ? { x: window.scrollX, y: window.scrollY }
        : { x: (scroller as HTMLElement).scrollLeft, y: (scroller as HTMLElement).scrollTop };

      if (scroller === window) window.scrollBy(step.x, step.y);
      else {
        (scroller as HTMLElement).scrollLeft += step.x;
        (scroller as HTMLElement).scrollTop += step.y;
      }

      const after = scroller === window
        ? { x: window.scrollX, y: window.scrollY }
        : { x: (scroller as HTMLElement).scrollLeft, y: (scroller as HTMLElement).scrollTop };

      // Whatever actually moved has changed what is under the pointer, so the
      // next frame must look again. If this surface could not move, fall
      // through to the one outside it — that is how a drag reaches the end of
      // a list inside a page that also scrolls.
      if (after.x !== before.x || after.y !== before.y) {
        current.dirty = true;
        return;
      }
    }
  }, []);

  /* ---------- The frame loop ---------- */

  const frame = useCallback(() => {
    const current = drag.current;
    if (!current) return;

    // The preview first and unconditionally: it is the thing being judged for
    // lag, and it must not wait on hit testing or on React.
    const ghost = ghostRef.current;
    if (ghost) {
      const x = current.pointer.x - current.grab.x;
      const y = current.pointer.y - current.grab.y;
      ghost.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    }

    autoScroll(current.pointer);

    if (current.dirty) {
      current.dirty = false;
      const next = hitTest(current.pointer, current.source);
      const previous = current.over;
      const changed =
        next?.id !== previous?.id ||
        next?.edge !== previous?.edge;
      if (changed) {
        current.over = next;
        setState((s) => (s.source ? { ...s, over: next } : s));
      }
    }

    current.frame = requestAnimationFrame(frame);
  }, [autoScroll, hitTest]);

  /* ---------- Teardown ---------- */

  const finish = useCallback((commit: boolean) => {
    const current = drag.current;
    const waiting = pending.current;

    if (waiting?.timer) window.clearTimeout(waiting.timer);
    pending.current = null;

    if (current) {
      // Where the pointer *ended*, not where the last frame found it. A quick
      // drag can be released between one frame and the next, and a drop
      // resolved from a stale frame lands somewhere the pointer had already
      // left — or, on a flick that starts and ends inside a single frame,
      // nowhere at all.
      const over = current.dirty ? hitTest(current.pointer, current.source) : current.over;

      if (current.frame) cancelAnimationFrame(current.frame);
      document.documentElement.classList.remove("dnd-dragging");
      suppressClick.current = true;
      drag.current = null;

      if (commit) {
        handlers.current.onDrop({ source: current.source, over });
      } else {
        handlers.current.onDragCancel?.();
      }
    }

    setState({ source: null, over: null });
  }, [hitTest]);

  /* ---------- Activation ---------- */

  const activate = useCallback((spec: DragStartSpec, pointerId: number, point: Point, touch: boolean) => {
    if (pending.current?.timer) window.clearTimeout(pending.current.timer);
    pending.current = null;

    const rect = spec.node.getBoundingClientRect();
    const source: DragSource = {
      id: spec.id,
      ids: spec.ids.includes(spec.id) ? spec.ids : [spec.id, ...spec.ids],
      data: spec.data,
      rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
    };

    drag.current = {
      pointerId,
      source,
      node: spec.node,
      // The grip, not the centre: whatever part of the row was under the
      // pointer stays under the pointer for the whole drag. This is the single
      // line that stops the thing sliding out from under the cursor.
      grab: { x: point.x - rect.left, y: point.y - rect.top },
      pointer: point,
      over: null,
      scrollers: collectScrollers(spec.node),
      frame: null,
      dirty: true,
    };

    document.documentElement.classList.add("dnd-dragging");
    // A short tick on a phone: the gesture has no cursor to change and no
    // hover to lose, so the only way to say "you have hold of it" is to be felt.
    if (touch && typeof navigator !== "undefined" && navigator.vibrate) {
      try { navigator.vibrate(12); } catch { /* not every browser allows it */ }
    }

    setState({ source, over: null });
    handlers.current.onDragStart?.(source);
    drag.current.frame = requestAnimationFrame(frame);
  }, [collectScrollers, frame]);

  /* ---------- Pointer pipeline ---------- */

  const startPointerDrag = useCallback((event: React.PointerEvent, spec: DragStartSpec) => {
    if (drag.current || pending.current) return;
    // Left button only for a mouse; any contact for touch and pen.
    if (event.pointerType === "mouse" && event.button !== 0) return;

    const touch = event.pointerType !== "mouse";
    const origin = { x: event.clientX, y: event.clientY };

    const waiting: NonNullable<typeof pending.current> = {
      pointerId: event.pointerId, origin, spec, touch, timer: null,
    };
    pending.current = waiting;

    if (touch) {
      // A finger is ambiguous in a way a mouse is not: the same movement that
      // starts a drag is how you scroll. Holding still is the one gesture that
      // cannot be either, so that is what picks a row up. Until the hold is
      // done the page is left entirely alone, which is why a swipe still
      // scrolls the list rather than dying halfway.
      const hold = spec.fromHandle ? HANDLE_HOLD_MS : TOUCH_HOLD_MS;
      waiting.timer = window.setTimeout(() => {
        if (pending.current !== waiting) return;
        activate(spec, waiting.pointerId, waiting.origin, true);
      }, hold);
    }
  }, [activate]);

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      const current = drag.current;
      if (current) {
        if (event.pointerId !== current.pointerId) return;
        current.pointer = { x: event.clientX, y: event.clientY };
        current.dirty = true;
        // The page has already been told not to scroll from this gesture; this
        // stops anything else (an iOS rubber band, a text selection) from
        // taking it over mid-drag.
        if (event.cancelable) event.preventDefault();
        return;
      }

      const waiting = pending.current;
      if (!waiting || event.pointerId !== waiting.pointerId) return;

      const travelled = distance(waiting.origin, { x: event.clientX, y: event.clientY });
      if (waiting.touch) {
        // Moved before the hold finished: this was a scroll. Let go of it
        // completely — the browser is already doing the right thing with it.
        if (travelled > TOUCH_TOLERANCE) {
          if (waiting.timer) window.clearTimeout(waiting.timer);
          pending.current = null;
        }
        return;
      }

      if (travelled >= MOUSE_THRESHOLD) {
        activate(waiting.spec, waiting.pointerId, { x: event.clientX, y: event.clientY }, false);
      }
    };

    const onPointerUp = (event: PointerEvent) => {
      const active = drag.current ?? pending.current;
      if (!active || event.pointerId !== active.pointerId) return;
      finish(!!drag.current);
    };

    const onPointerCancel = (event: PointerEvent) => {
      const active = drag.current ?? pending.current;
      if (!active || event.pointerId !== active.pointerId) return;
      finish(false);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && drag.current) {
        event.preventDefault();
        finish(false);
      }
    };

    // Non-passive, so it can actually refuse. Between the hold completing and
    // the first move, this is what keeps the browser from deciding the gesture
    // was a scroll after all and cancelling the pointer out from under us —
    // the exact way the old mechanism lost drags on a phone.
    const onTouchMove = (event: TouchEvent) => {
      if (drag.current && event.cancelable) event.preventDefault();
    };

    // A long press on Android raises the context menu, which would cancel the
    // drag the long press just started.
    const onContextMenu = (event: MouseEvent) => {
      if (drag.current) event.preventDefault();
    };

    // The press that ended a drag must not also count as a click on the row.
    const onClickCapture = (event: MouseEvent) => {
      if (!suppressClick.current) return;
      suppressClick.current = false;
      event.preventDefault();
      event.stopPropagation();
    };

    // Not every drag is followed by a click — a touch drag often is not — so
    // the next press anywhere clears the debt. Without this, a drag could eat
    // an unrelated click minutes later.
    const clearSuppression = () => { suppressClick.current = false; };

    window.addEventListener("pointermove", onPointerMove, { passive: false });
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerCancel);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("contextmenu", onContextMenu);
    window.addEventListener("click", onClickCapture, true);
    window.addEventListener("pointerdown", clearSuppression, true);

    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerCancel);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("contextmenu", onContextMenu);
      window.removeEventListener("click", onClickCapture, true);
      window.removeEventListener("pointerdown", clearSuppression, true);
    };
  }, [activate, finish]);

  // A drag that outlives its provider leaves the page unable to scroll.
  useEffect(() => () => {
    document.documentElement.classList.remove("dnd-dragging");
    if (drag.current?.frame) cancelAnimationFrame(drag.current.frame);
  }, []);

  const keyboardMove = useCallback((id: string, direction: -1 | 1, data: DragData) => {
    handlers.current.onKeyboardMove?.(id, direction, data);
  }, []);

  const manager = useMemo<DragManager>(() => ({
    scopeId, axis, registerDrop, unregisterDrop, startPointerDrag, keyboardMove, announce,
  }), [scopeId, axis, registerDrop, unregisterDrop, startPointerDrag, keyboardMove, announce]);

  const source = state.source;

  return (
    <ManagerContext.Provider value={manager}>
      <StateContext.Provider value={state}>
        {children}
        {source && typeof document !== "undefined" && createPortal(
          <div
            ref={(node) => {
              ghostRef.current = node;
              if (!node) return;
              // Placed before the browser has had a chance to paint it, so it
              // never appears at the top-left corner first.
              const current = drag.current;
              if (current) {
                const x = current.pointer.x - current.grab.x;
                const y = current.pointer.y - current.grab.y;
                node.style.transform = `translate3d(${x}px, ${y}px, 0)`;
              }
            }}
            data-dnd-preview
            aria-hidden
            className="pointer-events-none fixed left-0 top-0 z-[100] will-change-transform"
            style={{
              width: source.rect.width,
              // Scaling around the point you took hold of, so the lift does not
              // itself shift the row out from under the pointer.
              transformOrigin: `${(drag.current?.grab.x ?? 0)}px ${(drag.current?.grab.y ?? 0)}px`,
            }}
          >
            <div className="dnd-preview-lift">
              {renderPreview ? renderPreview(source) : (
                <div
                  ref={(host) => {
                    if (!host || host.childElementCount > 0) return;
                    // A copy of the row itself, taken from the page rather than
                    // described a second time in JSX — so the preview cannot
                    // drift out of step with what it is previewing.
                    const original = drag.current?.node;
                    if (!original) return;
                    const clone = original.cloneNode(true) as HTMLElement;
                    clone.removeAttribute("data-dnd-item");
                    clone.removeAttribute("data-dnd-target");
                    clone.style.width = `${source.rect.width}px`;
                    clone.style.height = `${source.rect.height}px`;
                    clone.style.margin = "0";
                    clone.style.opacity = "1";
                    clone.style.transform = "none";
                    host.appendChild(clone);
                  }}
                />
              )}
            </div>
          </div>,
          document.body,
        )}
        <div role="status" aria-live="polite" className="sr-only">{message}</div>
      </StateContext.Provider>
    </ManagerContext.Provider>
  );
}
