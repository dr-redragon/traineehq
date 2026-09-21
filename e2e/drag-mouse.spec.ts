import { devices } from "@playwright/test";
import { expect, test } from "../playwright-fixture";
import {
  above, below, centre, drift, HARNESS, previewBox, previewCount, START,
} from "./harness/drag-helpers";

/*
 * The same engine, with a mouse and with a keyboard.
 *
 * A pointer and a finger share one pipeline here, so most of what this covers
 * is the deliberate difference between them — a mouse drags on a few pixels of
 * movement rather than on a hold — plus the two things a pointer has that a
 * finger does not: a click that must survive, and an Escape key.
 */

test.use({ ...devices["Desktop Chrome"] });

test.describe("reordering with a mouse", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(HARNESS);
    await expect(page.getByTestId("order")).toHaveText(START);
  });

  test("a small movement on the handle starts a drag and lands in the gap", async ({ page }) => {
    // Released over the lower half of "registers", which is the gap below it.
    const from = await centre(page, "drag-handle-announcements");
    const to = await below(page, "card-registers");

    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) {
      await page.mouse.move(from.x, from.y + ((to.y - from.y) * i) / 10);
    }
    await page.mouse.up();

    await expect(page.getByTestId("order")).toHaveText("specialties,registers,announcements,bookmarks");
  });

  test("released over the top of a row, it lands above that row", async ({ page }) => {
    // The other half of the rule, and the half a list cannot do without: there
    // has to be a way to reach the gap above the first row.
    const from = await centre(page, "drag-handle-bookmarks");
    const to = await above(page, "card-announcements");

    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 12 });
    await page.mouse.up();

    await expect(page.getByTestId("order")).toHaveText("bookmarks,announcements,specialties,registers");
  });

  test("the preview tracks the cursor exactly", async ({ page }) => {
    const from = await centre(page, "drag-handle-announcements");
    const to = await centre(page, "card-bookmarks");

    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x, from.y + 8);

    const offsets: number[] = [];
    for (let i = 1; i <= 8; i++) {
      const y = from.y + ((to.y - from.y) * i) / 8;
      await page.mouse.move(from.x, y);
      const box = await previewBox(page);
      if (box) offsets.push(y - box.y);
    }
    await page.mouse.up();

    expect(offsets.length).toBeGreaterThan(4);
    expect(drift(offsets)).toBeLessThanOrEqual(2);
  });

  test("a click on the handle is not a drag", async ({ page }) => {
    await page.getByTestId("drag-handle-announcements").click();
    await expect(page.getByTestId("order")).toHaveText(START);
  });

  test("the arrow keys move a widget without a pointer at all", async ({ page }) => {
    await page.getByTestId("drag-handle-announcements").focus();
    await page.keyboard.press("ArrowDown");
    await expect(page.getByTestId("order")).toHaveText("specialties,announcements,registers,bookmarks");
    await page.keyboard.press("ArrowUp");
    await expect(page.getByTestId("order")).toHaveText(START);
  });

  test("escape puts everything back", async ({ page }) => {
    const from = await centre(page, "drag-handle-announcements");
    const to = await centre(page, "card-bookmarks");

    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 10 });
    await page.keyboard.press("Escape");
    await page.mouse.up();

    await expect(page.getByTestId("order")).toHaveText(START);
    expect(await previewCount(page)).toBe(0);
  });
});

test.describe("a folder row's three bands", () => {
  /*
   * The drive's folders are both a place in the order and a place to put
   * things. Which of the two a drop meant is decided by where on the row it
   * landed, and this is the only test that can say so from a real browser:
   * the bands are fractions of a rendered row's height.
   */
  test.beforeEach(async ({ page }) => {
    await page.goto(HARNESS);
    // Into the middle of the window, clear of the bands where a drag makes the
    // page creep — those are wanted behaviour, and aiming a test into one
    // would be measuring the auto-scroll rather than the drop.
    await page.getByTestId("drive-folder-b").evaluate((node) =>
      node.scrollIntoView({ block: "center" }));
  });

  const drag = async (page: import("@playwright/test").Page, from: { x: number; y: number }, to: { x: number; y: number }) => {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 12 });
    await page.mouse.up();
  };

  test("the middle of a folder swallows what is dropped on it", async ({ page }) => {
    await drag(page, await centre(page, "drive-file-a"), await centre(page, "drive-folder-b"));
    await expect(page.getByTestId("drop-log")).toHaveText("file-a:into:folder-b");
  });

  test("its top and bottom edges reorder it instead", async ({ page }) => {
    await drag(page, await centre(page, "drive-file-a"), await below(page, "drive-folder-b"));
    await expect(page.getByTestId("drop-log")).toHaveText("file-a:after:folder-b");

    await drag(page, await centre(page, "drive-file-c"), await above(page, "drive-folder-b"));
    await expect(page.getByTestId("drop-log")).toHaveText("file-c:before:folder-b");
  });

  test("a file row has no middle to swallow with", async ({ page }) => {
    // Only a folder gets the third answer: dropping on the heart of a file
    // still means "put it here", not "put it inside", because there is no
    // inside.
    await drag(page, await centre(page, "drive-folder-b"), await centre(page, "drive-file-c"));
    await expect(page.getByTestId("drop-log")).toHaveText("folder-b:after:file-c");
  });
});
