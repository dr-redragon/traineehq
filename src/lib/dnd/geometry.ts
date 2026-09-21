/**
 * The arithmetic behind dragging, with no DOM in sight.
 *
 * Everything here takes plain numbers and returns plain numbers, which is the
 * point: the parts of a drag that are easy to get subtly wrong — where an item
 * lands when you let go, which gap the line is drawn in, how fast the page
 * creeps when you hold near its edge — are the parts you cannot see going wrong
 * until somebody's carefully arranged list comes back shuffled. Kept here, they
 * are testable without a browser.
 *
 * The rest of the engine (pointer plumbing, hit testing, the floating preview)
 * lives in DragProvider.tsx.
 */

/** Where a pointer sits relative to the row under it. */
export type DropEdge = "before" | "after" | "into";

/** Which way a list runs. A rail of tabs is horizontal; most lists are not. */
export type DragAxis = "vertical" | "horizontal";

/**
 * What a drop target is willing to be.
 *
 * - `between` — a row in a list. You can only land above or below it.
 * - `into` — a container. Landing anywhere on it means "put it in here".
 * - `both` — a folder row: its edges reorder, its middle swallows.
 */
export type DropMode = "between" | "into" | "both";

export interface Point {
  x: number;
  y: number;
}

export interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

/**
 * How much of a `both` row, measured from its middle, means "into" rather than
 * "beside". Four tenths leaves three tenths at each end for reordering, which
 * on a 48px row is a 14px band — about a fingertip, and the smallest thing
 * anyone can reliably aim at.
 */
const INTO_BAND = 0.4;

/**
 * Which side of `box` the point falls on.
 *
 * The midpoint is the whole rule for an ordinary row: above it the item goes
 * before, below it after. That is deliberately the same line the drop indicator
 * is drawn at, so what you are shown and what gets written cannot disagree —
 * the bug that makes a reorder feel haunted is the one where they do.
 */
export function edgeForPoint(
  box: Box,
  point: Point,
  axis: DragAxis,
  mode: DropMode = "between",
  intoBand: number = INTO_BAND,
): DropEdge {
  if (mode === "into") return "into";

  const start = axis === "vertical" ? box.top : box.left;
  const extent = axis === "vertical" ? box.height : box.width;
  const along = axis === "vertical" ? point.y : point.x;

  // A zero-height row cannot be divided; treat the whole of it as "before".
  if (extent <= 0) return mode === "both" ? "into" : "before";

  const ratio = (along - start) / extent;

  if (mode === "both") {
    const half = intoBand / 2;
    if (ratio >= 0.5 - half && ratio <= 0.5 + half) return "into";
  }

  return ratio < 0.5 ? "before" : "after";
}

/**
 * The slot in the *original* list that an edge decision names.
 *
 * "Before row 3" is slot 3; "after row 3" is slot 4. Expressing the drop as a
 * gap rather than as a row-and-a-direction is what lets a multi-item move and
 * a single-item move share one code path, and what makes the indicator line
 * literally the thing being written.
 */
export function slotForEdge(overIndex: number, edge: DropEdge): number {
  return edge === "after" ? overIndex + 1 : overIndex;
}

/**
 * `list` with `items` dropped into the gap at `slot`.
 *
 * `slot` counts gaps in the list as it stands *before* anything moves — which
 * is what the indicator line shows — so anything being moved has to be
 * discounted from it before it is put back. Dragging a block of three from the
 * top of a list to the gap at index 5 should land them at index 2 of what is
 * left, not at 5.
 *
 * Items already in the list are lifted out first, so this covers both a
 * rearrangement and an arrival from somewhere else with one rule.
 */
export function insertItems<T>(
  list: T[],
  items: T[],
  slot: number,
  idOf: (item: T) => string,
): T[] {
  if (items.length === 0) return list;

  const moving = new Set(items.map(idOf));
  const rest = list.filter((item) => !moving.has(idOf(item)));
  const clamped = Math.max(0, Math.min(slot, list.length));
  const removedBefore = list.slice(0, clamped).filter((item) => moving.has(idOf(item))).length;
  const at = Math.max(0, Math.min(clamped - removedBefore, rest.length));

  return [...rest.slice(0, at), ...items, ...rest.slice(at)];
}

/**
 * `list` with every item in `ids` moved to the gap at `slot`.
 *
 * The moved items keep the order they had among themselves, which is what
 * makes dragging a multi-row selection predictable.
 */
export function moveItems<T>(
  list: T[],
  ids: Iterable<string>,
  slot: number,
  idOf: (item: T) => string,
): T[] {
  const moving = new Set(ids);
  if (moving.size === 0) return list;
  return insertItems(list, list.filter((item) => moving.has(idOf(item))), slot, idOf);
}

export interface AutoScrollConfig {
  /** How near an edge the pointer must come before the surface starts moving. */
  threshold: number;
  /** Pixels per frame at the very edge. */
  maxSpeed: number;
}

/**
 * Wide enough to aim at without meaning to, narrow enough that the last row of
 * a list near the bottom of the window is still a place you can drop on.
 */
export const AUTO_SCROLL: AutoScrollConfig = { threshold: 60, maxSpeed: 18 };

/**
 * How far a surface should scroll this frame to follow a pointer near its edge.
 *
 * Speed ramps with how deep into the edge band the pointer has come, so easing
 * towards the edge creeps and pushing right up against it moves properly — a
 * fixed speed is either too slow to reach the end of a long list or too fast to
 * stop where you meant to.
 */
export function autoScrollStep(
  box: Box,
  point: Point,
  config: AutoScrollConfig = AUTO_SCROLL,
): Point {
  const { threshold, maxSpeed } = config;

  const axis = (near: number, far: number, at: number): number => {
    const fromStart = at - near;
    const fromEnd = far - at;
    // Outside the box entirely: run at full tilt towards the side it left by,
    // so a finger dragged past the end of a list keeps it moving.
    if (fromStart < 0) return -maxSpeed;
    if (fromEnd < 0) return maxSpeed;
    if (fromStart < threshold) return -maxSpeed * (1 - fromStart / threshold);
    if (fromEnd < threshold) return maxSpeed * (1 - fromEnd / threshold);
    return 0;
  };

  return {
    x: axis(box.left, box.left + box.width, point.x),
    y: axis(box.top, box.top + box.height, point.y),
  };
}

/**
 * How far the pointer has travelled since it went down.
 *
 * Used for both halves of the activation question: for a mouse, has it moved
 * enough to mean a drag rather than a click; for a finger, has it moved so much
 * during the hold that it must have meant to scroll.
 */
export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
