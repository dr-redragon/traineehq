/**
 * Where a page should start when you arrive at it.
 *
 * A single-page app keeps one document for the whole site, so nothing resets
 * the scroll position between pages the way a full page load would. Follow a
 * link from halfway down the dashboard and the next page opens halfway down —
 * often past its own heading, sometimes past everything it has.
 *
 * React Router leaves this to the application deliberately, because the right
 * answer is not always "the top".
 */

/** The kinds React Router reports; matched by string so this stays testable. */
export type Navigation = "PUSH" | "REPLACE" | "POP";

/**
 * Whether arriving at this location should put the reader back at the top.
 *
 * Two cases say no, and both are somebody's intent rather than an edge case:
 *
 * - A `#hash` is a request for a *place* on the page. `/specialty/:id#discussion`
 *   is a link straight to the thread somebody is watching; scrolling to the top
 *   would be undoing what they clicked.
 * - Back and forward are a return to something already read. The browser
 *   restores the position it left, and taking that away loses the reader's
 *   place in a long resource list they were part-way down.
 */
export function shouldResetScroll(navigation: Navigation, hash: string): boolean {
  if (hash) return false;
  if (navigation === "POP") return false;
  return true;
}

/**
 * Put the reader at the top of whatever is actually scrolling.
 *
 * Which element that is depends on the layout: the dashboard shell grows past
 * the viewport so the window scrolls, while a layout that pins its header
 * scrolls an inner `<main>` instead. Resetting both is cheap, and costs
 * nothing when one of them was never scrolled.
 *
 * Jumps rather than animates: a smooth scroll on arrival means the new page
 * slides under you while you are already reading it.
 */
export function resetScroll(doc: Document = document): void {
  doc.defaultView?.scrollTo(0, 0);
  doc.querySelectorAll("main").forEach((el) => {
    el.scrollTop = 0;
  });
}
