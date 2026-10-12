import { describe, expect, it } from "vitest";
import { safeExternalUrl } from "./safeUrl";

describe("safeExternalUrl", () => {
  it("keeps ordinary web links", () => {
    expect(safeExternalUrl("https://www.rcseng.ac.uk/curriculum")).toBe("https://www.rcseng.ac.uk/curriculum");
    expect(safeExternalUrl("http://example.org/a?b=c")).toBe("http://example.org/a?b=c");
    expect(safeExternalUrl("  https://example.org  ")).toBe("https://example.org/");
  });

  it("refuses script-carrying schemes, however they are dressed", () => {
    for (const bad of [
      "javascript:alert(document.domain)",
      "JavaScript:alert(1)",
      " javascript:alert(1)",
      "java\tscript:alert(1)",
      "\u0000javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "vbscript:msgbox(1)",
      "blob:https://example.org/uuid",
    ]) {
      expect(safeExternalUrl(bad), bad).toBeNull();
    }
  });

  it("refuses things that are not absolute links", () => {
    expect(safeExternalUrl("spec/sub/file.pdf")).toBeNull();
    expect(safeExternalUrl("//evil.example/x")).toBeNull();
    expect(safeExternalUrl("")).toBeNull();
    expect(safeExternalUrl(null)).toBeNull();
    expect(safeExternalUrl(undefined)).toBeNull();
  });
});
