import { describe, it, expect } from "vitest";
import {
  certificateContent,
  certificateFilename,
  formatCertificateDate,
  renderCertificatePdf,
  bytesToBase64,
  type CertificateDetails,
} from "./certificate";

const ent: CertificateDetails = {
  traineeName: "Priya Raman",
  registerName: "NW · ENT (Otolaryngology – Head & Neck Surgery)",
  deaneryName: "North West",
  sessionTitle: "Airway emergencies",
  sessionDate: "2026-09-08",
  location: "Education Centre, Room 3",
};

const vascular: CertificateDetails = {
  traineeName: "Sam Okafor",
  registerName: "Yorkshire · Vascular Surgery",
  deaneryName: "Yorkshire and the Humber",
  sessionTitle: "Aortic aneurysm repair",
  sessionDate: "2026-11-20",
  location: null,
};

describe("certificateContent", () => {
  it("names the person and what they attended", () => {
    const c = certificateContent(ent);
    expect(c.recipient).toBe("Priya Raman");
    expect(c.sessionLine).toBe("Airway emergencies");
    expect(c.dateLine).toBe("on 8 September 2026");
  });

  /*
   * The reason certificates were not ported by copying: the original's footer
   * said "ENT Teaching Register" regardless of which register issued it. If
   * anybody reintroduces a fixed specialty, this fails.
   */
  it("takes its identity from the register, not from a hardcoded specialty", () => {
    expect(certificateContent(ent).footer)
      .toBe("NW · ENT (Otolaryngology – Head & Neck Surgery) · North West");
    expect(certificateContent(vascular).footer)
      .toBe("Yorkshire · Vascular Surgery · Yorkshire and the Humber");
  });

  it("never mentions a specialty the register did not name", () => {
    const words = Object.values(certificateContent(vascular)).join(" ");
    expect(words).not.toMatch(/ENT|Otolaryngology/i);
  });

  it("omits the location line when there is no location", () => {
    expect(certificateContent(vascular).locationLine).toBeNull();
    expect(certificateContent(ent).locationLine).toBe("at Education Centre, Room 3");
  });

  it("does not leave a dangling separator when a register has no deanery", () => {
    const c = certificateContent({ ...ent, deaneryName: "  " });
    expect(c.footer).toBe("NW · ENT (Otolaryngology – Head & Neck Surgery)");
    expect(c.footer).not.toMatch(/·\s*$/);
  });

  it("falls back rather than printing a blank certificate", () => {
    const c = certificateContent({ ...ent, traineeName: "   ", sessionTitle: "" });
    expect(c.recipient).toBe("Attendee");
    expect(c.sessionLine).toBe("Teaching session");
  });
});

describe("formatCertificateDate", () => {
  it("writes the date the way a person would read it aloud", () => {
    expect(formatCertificateDate("2026-09-08")).toBe("8 September 2026");
    expect(formatCertificateDate("2026-12-25")).toBe("25 December 2026");
  });

  it("does not slip a day at a timezone boundary", () => {
    // Parsed as local midnight rather than UTC, so a machine west of Greenwich
    // does not print the day before.
    expect(formatCertificateDate("2026-01-01")).toBe("1 January 2026");
  });

  it("returns anything unparseable untouched instead of printing 'Invalid Date'", () => {
    expect(formatCertificateDate("not-a-date")).toBe("not-a-date");
  });
});

describe("certificateFilename", () => {
  it("is safe on any filesystem and sorts by date", () => {
    expect(certificateFilename(ent)).toBe("certificate-priya-raman-2026-09-08.pdf");
  });

  it("copes with punctuation and accents in a name", () => {
    expect(certificateFilename({ ...ent, traineeName: "O'Neill-Smith, Áine" }))
      .toMatch(/^certificate-o-neill-smith-.*2026-09-08\.pdf$/);
  });
});

describe("renderCertificatePdf", () => {
  it("produces a real PDF", async () => {
    const bytes = await renderCertificatePdf(ent);
    // %PDF- magic number.
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    expect(bytes.byteLength).toBeGreaterThan(1000);
  });

  it("renders without a location, which is the case that has an optional line", async () => {
    const bytes = await renderCertificatePdf(vascular);
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
  });
});

describe("bytesToBase64", () => {
  it("round-trips through atob", () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 251, 255, 65, 66]);
    const decoded = atob(bytesToBase64(bytes));
    expect([...decoded].map((c) => c.charCodeAt(0))).toEqual([...bytes]);
  });

  it("handles a payload large enough to break the naive spread version", () => {
    // fromCharCode(...bytes) throws on arrays this size; the chunked loop does not.
    const big = new Uint8Array(200_000).fill(7);
    const encoded = bytesToBase64(big);
    expect(atob(encoded).length).toBe(big.length);
  });

  it("encodes a real certificate", async () => {
    const encoded = bytesToBase64(await renderCertificatePdf(ent));
    expect(atob(encoded).startsWith("%PDF-")).toBe(true);
  });
});
