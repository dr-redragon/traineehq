import { describe, expect, it } from "vitest";

/**
 * The rewrite performed by RegisterAliasRedirect in App.tsx. Kept here as a
 * pure function so the mapping can be tested without mounting the router.
 */
const toPlural = (pathname: string) =>
  pathname.replace(/^\/register(?=\/|$)/, "/registers");

describe("the /register alias", () => {
  it("sends the bare singular to the directory", () => {
    expect(toPlural("/register")).toBe("/registers");
  });

  it("carries the rest of the path across", () => {
    expect(toPlural("/register/northwest-ent")).toBe("/registers/northwest-ent");
    expect(toPlural("/register/northwest-ent/access")).toBe("/registers/northwest-ent/access");
    expect(toPlural("/register/checkin")).toBe("/registers/checkin");
  });

  it("leaves the plural form alone, so a redirect cannot loop", () => {
    expect(toPlural("/registers")).toBe("/registers");
    expect(toPlural("/registers/northwest-ent")).toBe("/registers/northwest-ent");
  });

  it("does not rewrite a path that merely starts with the same letters", () => {
    expect(toPlural("/registration")).toBe("/registration");
    expect(toPlural("/register-access")).toBe("/register-access");
  });

  it("only matches at the start", () => {
    expect(toPlural("/admin/register")).toBe("/admin/register");
  });
});
