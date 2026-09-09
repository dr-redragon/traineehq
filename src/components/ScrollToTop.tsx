import { useEffect } from "react";
import { useLocation, useNavigationType } from "react-router-dom";
import { resetScroll, shouldResetScroll, type Navigation } from "@/lib/scrollRestoration";

/**
 * Opens each page at the top. Renders nothing; mount it once inside the router.
 *
 * Keyed on the path alone, so a page that puts its own state in the query
 * string — a filter, a tab — does not throw the reader back to the top every
 * time they change it. The rules for when to leave the position alone live in
 * lib/scrollRestoration.ts, where they can be tested.
 */
export function ScrollToTop() {
  const { pathname, hash } = useLocation();
  const navigationType = useNavigationType();

  useEffect(() => {
    if (shouldResetScroll(navigationType as Navigation, hash)) resetScroll();
    // `hash` and `navigationType` describe *this* arrival rather than being
    // reasons to run again: a hash added to the path you are already on should
    // not re-trigger a reset.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return null;
}
