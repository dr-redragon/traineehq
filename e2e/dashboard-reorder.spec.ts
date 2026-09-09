import { devices } from "@playwright/test";
import { expect, test } from "../playwright-fixture";

/*
 * Dragging a dashboard widget with a finger.
 *
 * Drives e2e/harness/dnd.html, which imports the real sensors and the real
 * handle. Touch events go through CDP because Playwright's touchscreen API can
 * tap but not drag.
 *
 * WHAT THIS DOES AND DOES NOT PROVE. The failure on a real phone is the
 * browser deciding a touch is a scroll: it takes the gesture, fires
 * pointercancel, and dnd-kit never gets its drag. Emulated touch in headless
 * Chromium does not reproduce that — the old PointerSensor configuration
 * passes the two drag tests below quite happily. So they are a regression
 * guard on the gesture still working, not a reproduction of the bug.
 *
 * The two tests that do discriminate are the last ones, and they pin the two
 * halves of the fix: that a swipe is no longer treated as a drag (it was, with
 * the old sensor — that is the same ambiguity a phone resolves the other way,
 * as a scroll), and that the handle opts out of browser scrolling so a hold on
 * it cannot be stolen. Whether the whole thing feels right in the hand still
 * needs a device.
 */

test.use({ ...devices["Pixel 5"] });

const HARNESS = "/e2e/harness/dnd.html";

/** Press, hold past the activation delay, drag, release. */
async function longPressDrag(
  page: import("@playwright/test").Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
) {
  const cdp = await page.context().newCDPSession(page);
  const touch = (type: string, point?: { x: number; y: number }) =>
    cdp.send("Input.dispatchTouchEvent", {
      type,
      touchPoints: point ? [{ x: point.x, y: point.y }] : [],
    });

  await touch("touchStart", from);
  // The TouchSensor waits 250ms to be sure this is a hold and not a scroll.
  await page.waitForTimeout(450);

  const steps = 12;
  for (let i = 1; i <= steps; i++) {
    await touch("touchMove", {
      x: from.x + ((to.x - from.x) * i) / steps,
      y: from.y + ((to.y - from.y) * i) / steps,
    });
    await page.waitForTimeout(16);
  }
  await touch("touchEnd");
}

const centre = async (page: import("@playwright/test").Page, testId: string) => {
  const box = await page.getByTestId(testId).boundingBox();
  if (!box) throw new Error(`${testId} is not on the page`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};

test.describe("reordering dashboard widgets on a touch screen", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(HARNESS);
    await expect(page.getByTestId("order")).toHaveText("announcements,specialties,registers,bookmarks");
  });

  test("a press and hold on the handle drags a widget down the list", async ({ page }) => {
    const from = await centre(page, "drag-handle-announcements");
    const to = await centre(page, "drag-handle-registers");

    await longPressDrag(page, from, to);

    await expect(page.getByTestId("order")).toHaveText("specialties,registers,announcements,bookmarks");
  });

  test("a press and hold drags a widget up the list", async ({ page }) => {
    const from = await centre(page, "drag-handle-bookmarks");
    const to = await centre(page, "drag-handle-specialties");

    await longPressDrag(page, from, to);

    await expect(page.getByTestId("order")).toHaveText("announcements,bookmarks,specialties,registers");
  });

  test("a swipe without the hold leaves the order alone", async ({ page }) => {
    // The gesture the delay exists to protect: a finger that moves straight
    // away is scrolling the page, and must not pick a widget up. Under the old
    // PointerSensor this reordered the list — 5px of movement was all it took —
    // which is the same ambiguity that lost the drag on a real device.
    const from = await centre(page, "drag-handle-announcements");
    const to = await centre(page, "drag-handle-registers");

    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: from.x, y: from.y }] });
    for (let i = 1; i <= 8; i++) {
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: from.x, y: from.y + ((to.y - from.y) * i) / 8 }],
      });
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });

    await expect(page.getByTestId("order")).toHaveText("announcements,specialties,registers,bookmarks");
  });

  test("the handle opts out of browser scrolling", async ({ page }) => {
    // Without this the browser may start scrolling the page from the handle
    // and cancel the pointer stream mid-hold, which is how the drag was lost
    // on a phone. It belongs on the handle alone: on a whole row it would
    // leave a list that cannot be scrolled at all.
    await expect(page.getByTestId("drag-handle-announcements")).toHaveCSS("touch-action", "none");
  });
});
