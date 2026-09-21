import { devices } from "@playwright/test";
import { expect, test } from "../playwright-fixture";
import {
  above, below, centre, drift, HARNESS, previewCount, previewBox, START, type Point,
} from "./harness/drag-helpers";

/*
 * Dragging with a finger.
 *
 * Touch events go through CDP because Playwright's touchscreen API can tap but
 * not drag.
 *
 * WHAT THIS PROVES — three things only a browser can answer: that a press and
 * hold picks a row up and lands it in the gap the indicator drew; that a swipe
 * which does not hold is handed back to the browser, so the page scrolls and
 * nothing is rearranged; and that the thing in your hand stays under your
 * finger. That last one is the drift this engine was written to remove, and it
 * is measured here rather than described.
 *
 * What it cannot prove is how any of it feels in the hand. That needs a device.
 */

test.use({ ...devices["Pixel 5"] });

/** Press, hold past the activation delay, drag, release. */
async function longPressDrag(
  page: import("@playwright/test").Page,
  from: Point,
  to: Point,
  options: { steps?: number; onStep?: (at: Point) => Promise<void> } = {},
) {
  const cdp = await page.context().newCDPSession(page);
  const touch = (type: string, point?: Point) =>
    cdp.send("Input.dispatchTouchEvent", {
      type,
      touchPoints: point ? [{ x: point.x, y: point.y }] : [],
    });

  await touch("touchStart", from);
  // The hold is what tells a pick-up from the start of a scroll.
  await page.waitForTimeout(500);

  const steps = options.steps ?? 12;
  for (let i = 1; i <= steps; i++) {
    const at = {
      x: from.x + ((to.x - from.x) * i) / steps,
      y: from.y + ((to.y - from.y) * i) / steps,
    };
    await touch("touchMove", at);
    await page.waitForTimeout(24);
    await options.onStep?.(at);
  }
  await touch("touchEnd");
}

test.describe("reordering with a finger", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(HARNESS);
    await expect(page.getByTestId("order")).toHaveText(START);
  });

  test("a press and hold on the handle drags a widget down the list", async ({ page }) => {
    // Let go over the lower half of "registers": the gap below it.
    await longPressDrag(
      page,
      await centre(page, "drag-handle-announcements"),
      await below(page, "card-registers"),
    );
    await expect(page.getByTestId("order")).toHaveText("specialties,registers,announcements,bookmarks");
  });

  test("a press and hold drags a widget up the list", async ({ page }) => {
    // And over the upper half of "specialties": the gap above it.
    await longPressDrag(
      page,
      await centre(page, "drag-handle-bookmarks"),
      await above(page, "card-specialties"),
    );
    await expect(page.getByTestId("order")).toHaveText("announcements,bookmarks,specialties,registers");
  });

  test("a whole row can be picked up where there is no handle", async ({ page }) => {
    // The drive's rows work this way: no grip, so the hold is longer and the
    // row itself is what you take hold of.
    await longPressDrag(page, await centre(page, "row-announcements"), await below(page, "row-registers"));
    await expect(page.getByTestId("row-order")).toHaveText("specialties,registers,announcements,bookmarks");
  });

  test("the preview stays under the finger for the whole drag", async ({ page }) => {
    const from = await centre(page, "drag-handle-announcements");
    const to = await centre(page, "card-bookmarks");
    const offsets: number[] = [];

    await longPressDrag(page, from, to, {
      onStep: async (at) => {
        const box = await previewBox(page);
        // What must hold constant is the gap between the finger and the
        // preview's top edge: the grip is wherever the row was taken hold of.
        if (box) offsets.push(at.y - box.y);
      },
    });

    expect(offsets.length).toBeGreaterThan(4);
    expect(drift(offsets)).toBeLessThanOrEqual(2);
  });

  test("a swipe without the hold is never picked up at all", async ({ page }) => {
    // The gesture the hold exists to protect. A finger that moves straight
    // away is scrolling, and the engine has to hand the gesture back to the
    // browser untouched: nothing lifts, and nothing is rearranged. (That the
    // page then scrolls is the browser's own doing, and headless Chromium
    // does not always carry synthesised touches through to it — so what is
    // asserted here is our half of the bargain.)
    const from = await centre(page, "drag-handle-announcements");
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: from.x, y: from.y }] });
    for (let i = 1; i <= 8; i++) {
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: from.x, y: from.y - i * 20 }],
      });
      await page.waitForTimeout(16);
      expect(await previewCount(page)).toBe(0);
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });

    await expect(page.getByTestId("order")).toHaveText(START);
    expect(await previewCount(page)).toBe(0);
  });

  test("the handle opts out of browser scrolling", async ({ page }) => {
    // Without this the browser may start scrolling from the handle and cancel
    // the pointer stream mid-hold, which is how a drag is lost on a phone. It
    // belongs on the handle alone: on a whole row it would leave a list that
    // cannot be scrolled at all.
    await expect(page.getByTestId("drag-handle-announcements")).toHaveCSS("touch-action", "none");
  });
});
