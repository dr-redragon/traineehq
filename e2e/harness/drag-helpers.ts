import type { Page } from "@playwright/test";

/**
 * Shared machinery for the drag specs.
 *
 * Both specs drive e2e/harness/dnd.html, which mounts the real engine — the
 * same provider, hooks and handle the dashboard, the drive and the section
 * rail use. They are two files rather than one because a device profile can
 * only be chosen for a whole file, and the two halves of this are exactly
 * "with a finger" and "with a mouse".
 */

export const HARNESS = "/e2e/harness/dnd.html";
export const START = "announcements,specialties,registers,bookmarks";

export interface Point {
  x: number;
  y: number;
}

export async function centre(page: Page, testId: string): Promise<Point> {
  const box = await page.getByTestId(testId).boundingBox();
  if (!box) throw new Error(`${testId} is not on the page`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** Where the floating preview is. Only ask while a drag is running. */
export function previewBox(page: Page) {
  return page.locator("[data-dnd-preview]").boundingBox();
}

/** Whether anything is in the hand. Unlike `previewBox`, this never waits. */
export function previewCount(page: Page) {
  return page.locator("[data-dnd-preview]").count();
}

/**
 * How far the preview slipped against the pointer over a whole drag.
 *
 * This is the measurement the engine exists to keep at zero: what is in your
 * hand has to stay under your finger, whatever the page does underneath it.
 */
export function drift(offsets: number[]): number {
  return Math.max(...offsets) - Math.min(...offsets);
}

/**
 * A point in the upper or lower quarter of an element.
 *
 * Which side of a row you let go over is the whole of where a drop lands, so
 * the specs aim at a side rather than at the middle — the middle is the line
 * itself, and a test that aims at a line is a test about rounding.
 */
export async function above(page: Page, testId: string): Promise<Point> {
  const box = await page.getByTestId(testId).boundingBox();
  if (!box) throw new Error(`${testId} is not on the page`);
  return { x: box.x + box.width / 2, y: box.y + box.height * 0.2 };
}

export async function below(page: Page, testId: string): Promise<Point> {
  const box = await page.getByTestId(testId).boundingBox();
  if (!box) throw new Error(`${testId} is not on the page`);
  return { x: box.x + box.width / 2, y: box.y + box.height * 0.8 };
}
