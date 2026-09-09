// Attendance certificates, drawn on the server.
//
// WHY THIS EXISTS TWICE. The identical design lives in
// `src/lib/register/certificate.ts` for the browser, where an organiser
// downloads or previews one. It has to exist here as well because the moment a
// certificate is actually owed is the moment a trainee submits feedback — at
// nine in the evening, on their phone, with no organiser's browser open to draw
// it. That is the promise the sign-in page makes ("completing it releases your
// certificate"), and only the server can keep it.
//
// The two are kept in step by `src/lib/register/certificateParity.test.ts`,
// which reads this file and asserts that the wording, the palette and the
// layout constants match the browser's. Change one, change both.
import {
  PDFDocument, StandardFonts, rgb,
} from "https://esm.sh/pdf-lib@1.17.1?target=deno";

export interface CertificateDetails {
  traineeName: string;
  registerName: string;
  deaneryName: string;
  sessionTitle: string;
  /** ISO date (YYYY-MM-DD) of the teaching day. */
  sessionDate: string;
  location?: string | null;
  reference?: string | null;
  /** Public URL of the register's badge. Without one the layout closes up. */
  logoUrl?: string | null;
}

/** The original's palette, kept exactly. */
export const CERTIFICATE_PALETTE = {
  ink: [0.082, 0.129, 0.110],
  moss: [0.247, 0.420, 0.310],
  mossDeep: [0.173, 0.302, 0.224],
  gold: [0.690, 0.541, 0.243],
  paper: [0.988, 0.980, 0.960],
  muted: [0.478, 0.459, 0.408],
} as const;

/**
 * Latin letters that NFKD does not take apart and Latin-1 has no room for.
 * A Polish trainee called Łukasz must not get a certificate reading "ukasz".
 */
const UNDECOMPOSABLE: Record<string, string> = {
  "Ł": "L", "ł": "l",   // Ł ł
  "Đ": "D", "đ": "d",   // Đ đ
  "Ħ": "H", "ħ": "h",   // Ħ ħ
  "Ŧ": "T", "ŧ": "t",   // Ŧ ŧ
  "ı": "i",                  // ı
  "Œ": "OE", "œ": "oe", // Œ œ
};

/** Fold text down to what a standard (WinAnsi) PDF font can encode. */
export function safeText(text: unknown): string {
  return String(text ?? "")
    .replace(/[ŁłĐđĦħŦŧıŒœ]/g,
             (c) => UNDECOMPOSABLE[c] ?? c)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[‐-―]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "")
    .trim();
}

/** "2026-09-08" -> "8 September 2026". Falls back to the raw value. */
export function formatCertificateDate(iso: string): string {
  const parsed = new Date(iso + (iso.length === 10 ? "T00:00:00Z" : ""));
  if (Number.isNaN(parsed.getTime())) return safeText(iso);
  return parsed.toLocaleDateString("en-GB", {
    day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
  });
}

/** Every word that ends up on the certificate, built from the register. */
export function certificateContent(details: CertificateDetails) {
  const register = safeText(details.registerName) || "Teaching register";
  const deanery = safeText(details.deaneryName);
  const location = safeText(details.location ?? "");
  const reference = safeText(details.reference ?? "");

  const when = formatCertificateDate(details.sessionDate)
    + (location ? `  -  ${location}` : "");

  return {
    eyebrow: (deanery ? `${deanery} - ${register}` : register).toUpperCase(),
    heading: "Certificate of Attendance",
    lead: "This is to certify that",
    recipient: safeText(details.traineeName) || "Attendee",
    statement: "attended the teaching session",
    sessionLine: safeText(details.sessionTitle) || "Teaching session",
    whenLine: when,
    footerLeft: `Issued by ${register}`,
    footerRight: reference ? `Ref ${reference}` : null,
  };
}

export const PAGE = { width: 842, height: 595 } as const;
const TOP_LIMIT = PAGE.height - 34;
const FOOT_RULE_Y = 82;
const TEXT_BLOCK_DROP = 48 + 22 + 52 + 48 + 38 + 38 + 30;
const ASCENT = 11;
const DESCENT = 4;
export const LOGO_GAP = 20;

/** Where the composition sits: centred in the band between border and footer. */
export function certificateLayout(logoHeight = 0) {
  const logoBlock = logoHeight > 0 ? logoHeight + LOGO_GAP : 0;
  const blockHeight = logoBlock + ASCENT + TEXT_BLOCK_DROP + DESCENT;
  const bandCentre = (FOOT_RULE_Y + TOP_LIMIT) / 2;
  const blockTop = bandCentre + blockHeight / 2;
  return { eyebrowY: blockTop - logoBlock - ASCENT, logoBlock };
}

export async function renderCertificatePdf(details: CertificateDetails): Promise<Uint8Array> {
  const content = certificateContent(details);

  const pdf = await PDFDocument.create();
  pdf.setTitle(`Certificate of Attendance - ${content.recipient}`);
  pdf.setCreator(content.footerLeft);

  const page = pdf.addPage([PAGE.width, PAGE.height]);
  const { width, height } = page.getSize();

  const serif = await pdf.embedFont(StandardFonts.TimesRoman);
  const serifBold = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const sans = await pdf.embedFont(StandardFonts.Helvetica);
  const sansBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const colour = (c: readonly [number, number, number]) => rgb(c[0], c[1], c[2]);
  const INK = colour(CERTIFICATE_PALETTE.ink);
  const MOSS = colour(CERTIFICATE_PALETTE.moss);
  const MOSS_DEEP = colour(CERTIFICATE_PALETTE.mossDeep);
  const GOLD = colour(CERTIFICATE_PALETTE.gold);
  const PAPER = colour(CERTIFICATE_PALETTE.paper);
  const MUTED = colour(CERTIFICATE_PALETTE.muted);

  /** Centre a line, shrinking it only if it would run into the border. */
  const centre = (
    text: string, font: typeof serif, size: number, y: number, color = INK,
  ) => {
    const maxWidth = width - 140;
    let fitted = size;
    while (fitted > 6 && font.widthOfTextAtSize(text, fitted) > maxWidth) fitted -= 0.5;
    page.drawText(text, {
      x: (width - font.widthOfTextAtSize(text, fitted)) / 2,
      y, size: fitted, font, color,
    });
  };

  page.drawRectangle({ x: 0, y: 0, width, height, color: PAPER });
  page.drawRectangle({
    x: 26, y: 26, width: width - 52, height: height - 52,
    borderColor: MOSS, borderWidth: 2.5,
  });
  page.drawRectangle({
    x: 34, y: 34, width: width - 68, height: height - 68,
    borderColor: GOLD, borderWidth: 0.9,
  });

  // A badge that will not load must never block a certificate — the layout
  // simply closes up around its absence.
  let logoHeight = 0;
  let logo: Awaited<ReturnType<typeof pdf.embedPng>> | null = null;
  if (details.logoUrl) {
    try {
      const res = await fetch(details.logoUrl);
      if (res.ok) {
        const bytes = new Uint8Array(await res.arrayBuffer());
        const isPng = bytes[0] === 0x89 && bytes[1] === 0x50;
        const isJpg = bytes[0] === 0xff && bytes[1] === 0xd8;
        if (isPng) logo = await pdf.embedPng(bytes);
        else if (isJpg) logo = await pdf.embedJpg(bytes);
        if (logo) {
          const scale = Math.min(170 / logo.width, 78 / logo.height, 1);
          logoHeight = logo.height * scale;
        }
      }
    } catch {
      logo = null;
      logoHeight = 0;
    }
  }

  const layout = certificateLayout(logoHeight);
  let cursor = layout.eyebrowY;

  if (logo && logoHeight > 0) {
    const scale = Math.min(170 / logo.width, 78 / logo.height, 1);
    const w = logo.width * scale;
    page.drawImage(logo, {
      x: (width - w) / 2, y: cursor + LOGO_GAP, width: w, height: logoHeight,
    });
  }

  centre(content.eyebrow, sansBold, 11, cursor);
  cursor -= 48;
  centre(content.heading, serifBold, 36, cursor, MOSS_DEEP);
  cursor -= 22;
  page.drawLine({
    start: { x: width / 2 - 90, y: cursor }, end: { x: width / 2 + 90, y: cursor },
    thickness: 1.4, color: GOLD,
  });

  cursor -= 52;
  centre(content.lead, serif, 14.5, cursor, MUTED);
  cursor -= 48;
  centre(content.recipient, serifBold, 32, cursor);
  cursor -= 38;
  centre(content.statement, serif, 14.5, cursor, MUTED);
  cursor -= 38;
  centre(content.sessionLine, sansBold, 18, cursor, MOSS_DEEP);
  cursor -= 30;
  centre(content.whenLine, sans, 13, cursor, MUTED);

  page.drawLine({
    start: { x: 70, y: FOOT_RULE_Y + 20 }, end: { x: width - 70, y: FOOT_RULE_Y + 20 },
    thickness: 0.6, color: GOLD,
  });
  page.drawText(content.footerLeft, {
    x: 70, y: FOOT_RULE_Y, size: 9.5, font: sans, color: MUTED,
  });
  if (content.footerRight) {
    page.drawText(content.footerRight, {
      x: width - 70 - sans.widthOfTextAtSize(content.footerRight, 9.5),
      y: FOOT_RULE_Y, size: 9.5, font: sans, color: MUTED,
    });
  }

  return await pdf.save();
}

/** A filename that sorts sensibly and survives every filesystem. */
export function certificateFilename(details: CertificateDetails): string {
  const slug = (value: string) =>
    safeText(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const name = slug(details.traineeName) || "attendee";
  return `certificate-${name}-${details.sessionDate}.pdf`;
}
