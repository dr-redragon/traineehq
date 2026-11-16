import { describe, it, expect } from "vitest";
import { safeDestination } from "./safeDestination";

const FALLBACK = "/dashboard";

describe("safeDestination", () => {
  it("returns an in-app path unchanged", () => {
    expect(safeDestination("/registers/northwest-ent", FALLBACK))
      .toBe("/registers/northwest-ent");
  });

  it("keeps a query string, which is half of what makes a deep link a deep link", () => {
    expect(safeDestination("/specialty/123?tab=files", FALLBACK))
      .toBe("/specialty/123?tab=files");
  });

  it("falls back when nothing was requested", () => {
    expect(safeDestination(undefined, FALLBACK)).toBe(FALLBACK);
    expect(safeDestination(null, FALLBACK)).toBe(FALLBACK);
  });

  it("falls back when the state is not a string at all", () => {
    expect(safeDestination({ from: "/registers" }, FALLBACK)).toBe(FALLBACK);
    expect(safeDestination(42, FALLBACK)).toBe(FALLBACK);
  });

  // The point of the function. Each of these would send somebody who signed in
  // on this site to a page that is not this site.
  it("refuses an absolute URL", () => {
    expect(safeDestination("https://example.invalid/harvest", FALLBACK)).toBe(FALLBACK);
    expect(safeDestination("http://example.invalid", FALLBACK)).toBe(FALLBACK);
  });

  it("refuses a protocol-relative URL", () => {
    // The case a bare startsWith("/") check waves through.
    expect(safeDestination("//example.invalid/harvest", FALLBACK)).toBe(FALLBACK);
  });

  it("refuses backslash variants browsers may read as separators", () => {
    expect(safeDestination("/\\example.invalid", FALLBACK)).toBe(FALLBACK);
    expect(safeDestination("/registers\\@example.invalid", FALLBACK)).toBe(FALLBACK);
  });

  it("refuses a scheme that is not http", () => {
    expect(safeDestination("javascript:alert(1)", FALLBACK)).toBe(FALLBACK);
    expect(safeDestination("data:text/html,<script>", FALLBACK)).toBe(FALLBACK);
  });

  it("ignores surrounding whitespace rather than being fooled by it", () => {
    expect(safeDestination("  /registers  ", FALLBACK)).toBe("/registers");
    expect(safeDestination("  //example.invalid  ", FALLBACK)).toBe(FALLBACK);
  });
});
