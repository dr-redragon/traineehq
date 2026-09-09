import { describe, it, expect, beforeEach } from "vitest";
import { resetScroll, shouldResetScroll } from "./scrollRestoration";

describe("shouldResetScroll", () => {
  it("puts a followed link at the top", () => {
    expect(shouldResetScroll("PUSH", "")).toBe(true);
    expect(shouldResetScroll("REPLACE", "")).toBe(true);
  });

  it("leaves a #hash link alone", () => {
    // /specialty/:id#discussion is a link to the thread, not to the page.
    expect(shouldResetScroll("PUSH", "#discussion")).toBe(false);
    expect(shouldResetScroll("PUSH", "#contacts")).toBe(false);
  });

  it("leaves back and forward alone", () => {
    // Returning to a list you were part-way down should return you to the
    // place you were, which is what the browser already restores.
    expect(shouldResetScroll("POP", "")).toBe(false);
  });
});

describe("resetScroll", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("resets an inner scrolling main, not only the window", () => {
    document.body.innerHTML = `<main></main>`;
    const main = document.querySelector("main")!;
    main.scrollTop = 400;
    resetScroll(document);
    expect(main.scrollTop).toBe(0);
  });

  it("does nothing objectionable when there is no main at all", () => {
    expect(() => resetScroll(document)).not.toThrow();
  });
});
