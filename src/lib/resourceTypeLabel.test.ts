import { describe, it, expect } from "vitest";

import { abbreviatedResourceType } from "./resourceTypeLabel";

describe("abbreviatedResourceType", () => {
  it("shortens the long type names", () => {
    expect(abbreviatedResourceType("document")).toBe("DOC");
    expect(abbreviatedResourceType("presentation")).toBe("SLIDES");
    expect(abbreviatedResourceType("checklist")).toBe("LIST");
  });

  it("leaves the short ones as they were, just uppercased", () => {
    expect(abbreviatedResourceType("pdf")).toBe("PDF");
    expect(abbreviatedResourceType("video")).toBe("VIDEO");
    expect(abbreviatedResourceType("link")).toBe("LINK");
    expect(abbreviatedResourceType("folder")).toBe("FOLDER");
  });

  it("copes with a type it has never seen, rather than throwing", () => {
    expect(abbreviatedResourceType("dataset")).toBe("DATASET");
  });
});
