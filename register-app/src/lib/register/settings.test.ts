import { describe, expect, it } from "vitest";
import { normaliseBlob } from "./blob";
import {
  certificateColours, certificateContent, designToStore, hexToRgb, normaliseDesign,
  renderCertificatePdf,
} from "./certificate";
import { cleanList, excusalReasonsOf, EXCUSAL_REASONS, GRADES, gradesOf, LIST_MAX, OTHER_REASON } from "./constants";
import { contentSecurityPolicy } from "../contentSecurityPolicy";

/*
 * Everything here reads something a register's members typed and that other
 * people — including anonymous visitors on the sign-in form — are then shown.
 * None of it is trusted as stored.
 */

describe("a register's own lists", () => {
  it("falls back to the defaults until a list is set", () => {
    expect(gradesOf(null)).toEqual([...GRADES]);
    expect(gradesOf({ settings: {} })).toEqual([...GRADES]);
    expect(excusalReasonsOf(undefined)).toEqual([...EXCUSAL_REASONS]);
  });

  it("uses the register's list, tidied", () => {
    expect(gradesOf({ settings: { grades: [" Nurse ", "nurse", "", "Consultant", 7, null] } }))
      .toEqual(["Nurse", "Consultant"]);
  });

  it("reads the public roster's shape as well as the blob's", () => {
    expect(gradesOf({ grades: ["Student", "Tutor"] })).toEqual(["Student", "Tutor"]);
    expect(gradesOf({ grades: null })).toEqual([...GRADES]);
  });

  it("always offers Other last, exactly once", () => {
    const reasons = excusalReasonsOf({ settings: { excusalReasons: ["Clinic", "other", "Travel"] } });
    expect(reasons).toEqual(["Clinic", "Travel", OTHER_REASON]);
  });

  it("caps the length of a list and of each entry", () => {
    const many = Array.from({ length: 500 }, (_, i) => `item ${i} ${"x".repeat(200)}`);
    const cleaned = cleanList(many);
    expect(cleaned).toHaveLength(LIST_MAX);
    expect(cleaned.every((item) => item.length <= 60)).toBe(true);
  });

  it("ignores a list that is not a list", () => {
    expect(cleanList("ST3,ST4")).toEqual([]);
    expect(gradesOf({ settings: { grades: { 0: "x" } } })).toEqual([...GRADES]);
  });

  it("survives a round trip through normaliseBlob, and is not invented", () => {
    expect(normaliseBlob({ settings: { grades: ["A"] } }).settings).toEqual({ grades: ["A"] });
    expect("settings" in normaliseBlob({})).toBe(false);
    expect("settings" in normaliseBlob({ settings: [] as never })).toBe(false);
  });
});

describe("certificate designs", () => {
  const details = {
    traineeName: "Asha Patel", registerName: "Spring Study Day", deaneryName: "",
    sessionTitle: "Day 1", sessionDate: "2027-03-10",
  };

  it("is the classic template with its own wording when nothing is stored", () => {
    for (const raw of [null, undefined, "modern", [], 4]) {
      expect(normaliseDesign(raw).template).toBe("classic");
    }
    const content = certificateContent(details);
    expect(content.heading).toBe("Certificate of Attendance");
    expect(content.footerLeft).toBe("Issued by Spring Study Day");
    expect(content.footerRight).toBeNull();
  });

  it("refuses a template that does not exist and a colour that is not one", () => {
    const design = normaliseDesign({ template: "../../etc", accent: "url(javascript:alert(1))" });
    expect(design.template).toBe("classic");
    expect(design.accent).toBeNull();
    expect(normaliseDesign({ accent: "#ABCDEF" }).accent).toBe("#abcdef");
    expect(normaliseDesign({ accent: "#abc" }).accent).toBeNull();
  });

  it("applies custom wording, capped and folded to printable text", () => {
    const content = certificateContent({
      ...details,
      design: {
        heading: "Certificate of Completion", lead: "We certify that", statement: "completed",
        issuedBy: "x".repeat(500), signatoryName: "Dr Łukasz Ω", signatoryTitle: "Course Director",
      },
    });
    expect(content.heading).toBe("Certificate of Completion");
    expect(content.lead).toBe("We certify that");
    expect(content.statement).toBe("completed");
    expect(content.footerLeft).toHaveLength(80);
    expect(content.footerRight).toBe("Dr Lukasz, Course Director");
  });

  it("prints a reference in preference to the signatory", () => {
    const content = certificateContent({ ...details, reference: "R-1", design: { signatoryName: "Dr A" } });
    expect(content.footerRight).toBe("Ref R-1");
  });

  it("stores only what was changed", () => {
    expect(designToStore(normaliseDesign({}))).toEqual({ template: "classic" });
    expect(designToStore(normaliseDesign({ template: "modern", accent: "#005eb8", heading: " Hi " })))
      .toEqual({ template: "modern", accent: "#005eb8", heading: "Hi" });
  });

  it("keeps black and white black and white whatever colour is chosen", () => {
    expect(certificateColours(normaliseDesign({ template: "mono", accent: "#ff0000" })).primary).toEqual([0, 0, 0]);
    expect(certificateColours(normaliseDesign({ template: "modern", accent: "#ff0000" })).primary)
      .toEqual(hexToRgb("#ff0000"));
  });

  it("draws every template to a PDF", async () => {
    for (const template of ["classic", "modern", "mono"]) {
      const bytes = await renderCertificatePdf({
        ...details, design: { template, accent: "#005eb8", signatoryName: "Dr A", signatoryTitle: "TPD" },
      });
      expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    }
  });
});

describe("contentSecurityPolicy", () => {
  const policy = contentSecurityPolicy("https://abc.supabase.co/");

  it("allows this Supabase project and nothing else to be connected to", () => {
    expect(policy).toContain("connect-src 'self' https://abc.supabase.co wss://abc.supabase.co");
  });

  it("forbids inline and third-party script", () => {
    expect(policy).toContain("script-src 'self';");
    expect(policy).not.toMatch(/script-src[^;]*unsafe/);
    expect(policy).toContain("object-src 'none'");
  });

  it("still closes everything when no project is configured", () => {
    expect(contentSecurityPolicy(undefined)).toContain("connect-src 'self';");
    expect(contentSecurityPolicy("not a url")).toContain("connect-src 'self';");
  });
});
