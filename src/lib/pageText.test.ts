import { describe, expect, it } from "vitest";
import { pageTextSummary, parseInline, parsePageText, safeHref, toggleLinePrefix } from "./pageText";

describe("parsePageText", () => {
  it("is empty for no text", () => {
    expect(parsePageText(null)).toEqual([]);
    expect(parsePageText("  \n \n")).toEqual([]);
  });

  it("splits headings, paragraphs, lists and callouts", () => {
    const blocks = parsePageText([
      "## Overview",
      "Every doctor must have an ARCP",
      "at least once a year.",
      "",
      "- Form R",
      "- Learning Agreement",
      "",
      "1. Tell your TPD",
      "2. Submit the form",
      "> Please note",
      "> IPRs are arranged by your TPD.",
      "### Dates",
    ].join("\n"));

    expect(blocks.map((b) => b.type)).toEqual(["heading", "paragraph", "list", "list", "callout", "heading"]);
    expect(blocks[0]).toMatchObject({ type: "heading", level: 2 });
    expect(blocks[1]).toMatchObject({ type: "paragraph" });
    expect((blocks[1] as { lines: unknown[] }).lines).toHaveLength(2);
    expect(blocks[2]).toMatchObject({ type: "list", ordered: false });
    expect((blocks[3] as { items: unknown[] }).items).toHaveLength(2);
    expect(blocks[3]).toMatchObject({ type: "list", ordered: true });
    expect((blocks[4] as { lines: unknown[] }).lines).toHaveLength(2);
    expect(blocks[5]).toMatchObject({ type: "heading", level: 3 });
  });

  it("does not read *italic* at the start of a line as a bullet", () => {
    expect(parsePageText("*Note* this")[0].type).toBe("paragraph");
  });
});

describe("parseInline", () => {
  it("turns markdown links and bare addresses into links", () => {
    const nodes = parseInline("See [the ISCP site](https://www.iscp.ac.uk) or https://www.gmc-uk.org.");
    const links = nodes.filter((n) => n.type === "link");
    expect(links).toHaveLength(2);
    expect(links[0]).toMatchObject({ href: "https://www.iscp.ac.uk/" });
    // The full stop after a bare address is the sentence's, not the link's.
    expect(links[1]).toMatchObject({ href: "https://www.gmc-uk.org/" });
    expect(nodes[nodes.length - 1]).toEqual({ type: "text", text: "." });
  });

  it("keeps formatting inside and around links", () => {
    const nodes = parseInline("**Read** [the *guide*](https://example.org)");
    expect(nodes[0]).toMatchObject({ type: "bold" });
    expect(nodes[2]).toMatchObject({ type: "link", children: [{ type: "text", text: "the " }, { type: "italic" }] });
  });

  it("leaves unsafe addresses as text", () => {
    const nodes = parseInline("[click](javascript:alert(1))");
    expect(nodes.some((n) => n.type === "link")).toBe(false);
  });
});

describe("safeHref", () => {
  it("allows web and mail addresses only", () => {
    expect(safeHref("https://nhs.net")).toBe("https://nhs.net/");
    expect(safeHref("mailto:england.surgery.nw@nhs.net")).toBe("mailto:england.surgery.nw@nhs.net");
    expect(safeHref("javascript:alert(1)")).toBeNull();
    expect(safeHref("data:text/html,hi")).toBeNull();
    expect(safeHref("/relative")).toBeNull();
  });
});

describe("pageTextSummary", () => {
  it("strips the markup and shortens", () => {
    expect(pageTextSummary("## Overview\n- **Form R** and [ISCP](https://iscp.ac.uk)")).toBe("Overview Form R and ISCP");
    expect(pageTextSummary("a".repeat(200), 10)).toHaveLength(10);
  });
});

describe("toggleLinePrefix", () => {
  it("prefixes every touched line, then takes it off again", () => {
    const text = "one\ntwo\nthree";
    const on = toggleLinePrefix(text, 1, 6, "- ");
    expect(on.value).toBe("- one\n- two\nthree");
    expect(toggleLinePrefix(on.value, on.selectionStart, on.selectionEnd, "- ").value).toBe(text);
  });

  it("replaces another marker rather than stacking", () => {
    expect(toggleLinePrefix("- Dates", 3, 3, "## ").value).toBe("## Dates");
  });
});
