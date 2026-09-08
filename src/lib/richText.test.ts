import { describe, it, expect } from "vitest";
import { parseRichText, toggleMarker, isPlainText, type RichNode } from "./richText";

const text = (t: string): RichNode => ({ type: "text", text: t });

describe("parseRichText", () => {
  it("leaves plain text alone", () => {
    expect(parseRichText("Teaching is on Thursday")).toEqual([text("Teaching is on Thursday")]);
  });

  it("parses each mark", () => {
    expect(parseRichText("**b**")).toEqual([{ type: "bold", children: [text("b")] }]);
    expect(parseRichText("*i*")).toEqual([{ type: "italic", children: [text("i")] }]);
    expect(parseRichText("__u__")).toEqual([{ type: "underline", children: [text("u")] }]);
    expect(parseRichText("~~s~~")).toEqual([{ type: "strike", children: [text("s")] }]);
  });

  it("keeps surrounding text and nests marks", () => {
    expect(parseRichText("a **b *c* ** d")).toEqual([
      text("a "),
      { type: "bold", children: [text("b "), { type: "italic", children: [text("c")] }, text(" ")] },
      text(" d"),
    ]);
  });

  it("treats unmatched markers as literal text", () => {
    expect(parseRichText("2 * 3 = 6")).toEqual([text("2 * 3 = 6")]);
    expect(parseRichText("**unclosed")).toEqual([text("**unclosed")]);
    expect(parseRichText("****")).toEqual([text("****")]);
  });

  it("prefers the longer marker", () => {
    expect(parseRichText("**bold**")[0].type).toBe("bold");
    expect(parseRichText("__under__")[0].type).toBe("underline");
  });

  it("preserves newlines", () => {
    expect(parseRichText("one\ntwo")).toEqual([text("one\ntwo")]);
  });

  it("reports whether text carries any formatting", () => {
    expect(isPlainText("nothing here")).toBe(true);
    expect(isPlainText("a **b**")).toBe(false);
  });
});

describe("toggleMarker", () => {
  it("wraps the selection", () => {
    // "abc" with "b" selected
    expect(toggleMarker("abc", 1, 2, "bold")).toEqual({
      value: "a**b**c", selectionStart: 3, selectionEnd: 4,
    });
  });

  it("unwraps when the markers are inside the selection", () => {
    expect(toggleMarker("a**b**c", 1, 6, "bold")).toEqual({
      value: "abc", selectionStart: 1, selectionEnd: 2,
    });
  });

  it("unwraps when the markers sit just outside the selection", () => {
    expect(toggleMarker("a**b**c", 3, 4, "bold")).toEqual({
      value: "abc", selectionStart: 1, selectionEnd: 2,
    });
  });

  it("inserts an empty pair with the caret between them", () => {
    expect(toggleMarker("ab", 1, 1, "italic")).toEqual({
      value: "a**b", selectionStart: 2, selectionEnd: 2,
    });
  });

  it("handles a backwards selection", () => {
    expect(toggleMarker("abc", 2, 1, "strike")).toEqual({
      value: "a~~b~~c", selectionStart: 3, selectionEnd: 4,
    });
  });

  it("round-trips through the parser", () => {
    const wrapped = toggleMarker("hello world", 0, 5, "underline");
    expect(wrapped.value).toBe("__hello__ world");
    expect(parseRichText(wrapped.value)).toEqual([
      { type: "underline", children: [text("hello")] },
      text(" world"),
    ]);
  });
});
