import { describe, it, expect } from "vitest";
import {
  bytesToBase64,
  certificateContent,
  certificateFilename,
  certificateLayout,
  formatCertificateDate,
  renderCertificatePdf,
  safeText,
  LOGO_GAP,
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

describe("safeText", () => {
  /*
   * Standard PDF fonts are WinAnsi and pdf-lib throws on anything outside it.
   * Without this fold a trainee whose name it cannot encode gets no
   * certificate at all — which is a worse outcome than an unaccented name.
   */
  it("folds accents to their base letters", () => {
    expect(safeText("Áine Ó Súilleabháin")).toBe("Aine O Suilleabhain");
    expect(safeText("Zoë Straße")).toBe("Zoe Straße");
  });

  it("folds the typographic punctuation this application actually produces", () => {
    // Specialty names carry an en dash; register names carry a middle dot.
    expect(safeText("ENT – Head & Neck")).toBe("ENT - Head & Neck");
    expect(safeText("O’Neill")).toBe("O'Neill");
    expect(safeText("“quoted”")).toBe('"quoted"');
  });

  it("drops what cannot be represented rather than throwing later", () => {
    expect(safeText("Wei 伟 Zhang")).toBe("Wei  Zhang");
    expect(safeText("emoji 🎓 here")).toBe("emoji  here");
  });

  it("copes with nothing at all", () => {
    expect(safeText(null)).toBe("");
    expect(safeText(undefined)).toBe("");
  });
});

describe("certificateContent", () => {
  it("names the person and what they attended", () => {
    const c = certificateContent(ent);
    expect(c.recipient).toBe("Priya Raman");
    expect(c.sessionLine).toBe("Airway emergencies");
    expect(c.whenLine).toBe("8 September 2026  -  Education Centre, Room 3");
  });

  /*
   * The reason certificates could not simply be copied across: the original
   * said "ENT REGIONAL TEACHING" above the title and "Issued by the ENT
   * Regional Teaching Programme" at the foot, whichever register issued it.
   */
  it("takes the eyebrow and the footer from the register", () => {
    const c = certificateContent(vascular);
    expect(c.eyebrow).toBe("YORKSHIRE AND THE HUMBER - YORKSHIRE · VASCULAR SURGERY");
    expect(c.footerLeft).toBe("Issued by Yorkshire · Vascular Surgery");
  });

  it("never mentions a specialty the register did not name", () => {
    const words = Object.values(certificateContent(vascular)).join(" ");
    expect(words).not.toMatch(/ENT|Otolaryngology|Regional Teaching Programme/i);
  });

  it("omits the reference line unless the register uses one", () => {
    expect(certificateContent(ent).footerRight).toBeNull();
    expect(certificateContent({ ...ent, reference: "NW-2026-014" }).footerRight)
      .toBe("Ref NW-2026-014");
  });

  it("leaves out the location rather than trailing a separator", () => {
    expect(certificateContent(vascular).whenLine).toBe("20 November 2026");
  });

  it("falls back rather than printing a blank certificate", () => {
    const c = certificateContent({ ...ent, traineeName: "   ", sessionTitle: "" });
    expect(c.recipient).toBe("Attendee");
    expect(c.sessionLine).toBe("Teaching session");
  });

  it("puts nothing through to the page that a standard font cannot set", () => {
    const c = certificateContent({ ...ent, traineeName: "Łukasz 伟" });
    // The original dropped Ł outright, so Łukasz was certified as "ukasz".
    expect(c.recipient).toBe("Lukasz");
    // The en dash in the specialty name is folded, not dropped.
    expect(c.eyebrow).toContain("HEAD & NECK");
  });
});

describe("certificateLayout", () => {
  const BAND_CENTRE = (82 + (595 - 34)) / 2;

  /** Where the ink actually starts and stops, for a given logo height. */
  function extent(logoHeight: number) {
    const { eyebrowY, logoBlock } = certificateLayout(logoHeight);
    return { top: eyebrowY + logoBlock + 11, bottom: eyebrowY - 276 - 4 };
  }

  it("centres the composition when there is a logo", () => {
    const { top, bottom } = extent(78);
    expect((top + bottom) / 2).toBeCloseTo(BAND_CENTRE, 5);
  });

  /*
   * The point of the reflow. The original moved the block down only when a
   * badge was present, so a register without one got the badge's space as dead
   * air at the foot with everything riding high.
   */
  it("centres it just the same when there is none", () => {
    const { top, bottom } = extent(0);
    expect((top + bottom) / 2).toBeCloseTo(BAND_CENTRE, 5);
  });

  it("closes the gap up rather than leaving a hole where the badge was", () => {
    const withLogo = certificateLayout(78);
    const without = certificateLayout(0);
    expect(without.logoBlock).toBe(0);
    // Without a badge the text starts lower on the page, taking back half of
    // the space the badge would have used instead of leaving it at the foot.
    expect(without.eyebrowY).toBeGreaterThan(withLogo.eyebrowY);
    expect(without.eyebrowY - withLogo.eyebrowY).toBeCloseTo((78 + LOGO_GAP) / 2, 5);
  });

  it("stays inside the border whatever size the badge is", () => {
    for (const h of [0, 20, 50, 78]) {
      const { top, bottom } = extent(h);
      expect(top).toBeLessThan(595 - 34);
      expect(bottom).toBeGreaterThan(82);
    }
  });

  it("lands close to where the original put it, with a badge", () => {
    // The original's fixed geometry was height - 100 - (logoHeight + 20) = 397.
    // Centring puts it ten points lower, because the original was not quite
    // centred. Close enough to be the same design; the drift is the fix.
    const drift = certificateLayout(78).eyebrowY - (595 - 100 - 98);
    expect(Math.abs(drift)).toBeLessThan(15);
  });
});

describe("formatCertificateDate", () => {
  it("writes the date the way a person would read it aloud", () => {
    expect(formatCertificateDate("2026-09-08")).toBe("8 September 2026");
    expect(formatCertificateDate("2026-12-25")).toBe("25 December 2026");
  });

  it("does not slip a day at a timezone boundary", () => {
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
      .toBe("certificate-o-neill-smith-aine-2026-09-08.pdf");
  });
});

describe("renderCertificatePdf", () => {
  it("produces a real PDF", async () => {
    const bytes = await renderCertificatePdf(ent);
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    expect(bytes.byteLength).toBeGreaterThan(1000);
  });

  it("renders with no logo and no location, the case with two optional pieces", async () => {
    const bytes = await renderCertificatePdf(vascular);
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
  });

  it("still issues a certificate when the logo cannot be fetched", async () => {
    // A register whose badge has been deleted, or a network that is down: the
    // certificate must still come out, without the badge.
    const bytes = await renderCertificatePdf({
      ...ent, logoUrl: "http://127.0.0.1:1/missing.png",
    });
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
  });

  it("does not throw on a name a standard font cannot encode", async () => {
    const bytes = await renderCertificatePdf({ ...ent, traineeName: "伟 Zhāng" });
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
    const big = new Uint8Array(200_000).fill(7);
    expect(atob(bytesToBase64(big)).length).toBe(big.length);
  });

  it("encodes a real certificate", async () => {
    const encoded = bytesToBase64(await renderCertificatePdf(ent));
    expect(atob(encoded).startsWith("%PDF-")).toBe(true);
  });
});
