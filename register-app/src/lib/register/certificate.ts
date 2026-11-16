/**
 * Attendance certificates.
 *
 * The design is the standalone ENT register's, ported: paper ground, moss and
 * gold double border, Times for the ceremony and Helvetica for the facts. What
 * changed is everything that named one programme. The original said
 * "ENT REGIONAL TEACHING" above the title and "Issued by the ENT Regional
 * Teaching Programme" at the foot, and took its badge from an environment
 * variable — one logo for one register. Here the words come from the register
 * and the badge is uploaded by the people who run it, so a second register does
 * not issue certificates in the first one's name.
 *
 * The wording is split from the drawing on purpose. `certificateContent` and
 * `certificateLayout` are pure and tested; `renderCertificatePdf` is the pdf-lib
 * call no assertion can read. Everything that could be *wrong* — whose name,
 * which register, which date, and whether the composition sits square on the
 * page — lives in the half a test can see.
 */

export interface CertificateDetails {
  traineeName: string;
  registerName: string;
  deaneryName: string;
  sessionTitle: string;
  /** ISO date (YYYY-MM-DD) of the teaching day. */
  sessionDate: string;
  location?: string | null;
  /** Printed at the foot, if the register uses references. */
  reference?: string | null;
  /** Public URL of the register's badge. Without one the layout closes up. */
  logoUrl?: string | null;
  /**
   * The register's template, colour and wording, as stored. Untrusted: it is
   * passed through `normaliseDesign` before anything is drawn from it.
   */
  design?: unknown;
}

/* ---------------------------------------------------------------- templates */

export type CertificateTemplateId = "classic" | "modern" | "mono";

type Rgb = readonly [number, number, number];

export interface CertificateTemplate {
  id: CertificateTemplateId;
  name: string;
  description: string;
  /** Titles and the recipient's name in Times, or everything in Helvetica. */
  serif: boolean;
  frame: "double" | "single" | "band";
  /** Headings and, on a band template, the band. Replaced by a chosen accent. */
  primary: Rgb;
  /** Hairlines. Null follows the primary colour. */
  rule: Rgb | null;
  paper: Rgb;
  ink: Rgb;
  muted: Rgb;
}

export const CERTIFICATE_TEMPLATES: CertificateTemplate[] = [
  {
    id: "classic", name: "Classic",
    description: "Cream paper, a double border and serif lettering.",
    serif: true, frame: "double",
    primary: [0.173, 0.302, 0.224], rule: [0.690, 0.541, 0.243],
    paper: [0.988, 0.980, 0.960], ink: [0.082, 0.129, 0.110], muted: [0.478, 0.459, 0.408],
  },
  {
    id: "modern", name: "Modern",
    description: "White, a bold band of colour and clean sans-serif type.",
    serif: false, frame: "band",
    primary: [0.867, 0.169, 0.059], rule: null,
    paper: [1, 1, 1], ink: [0.125, 0.118, 0.114], muted: [0.376, 0.365, 0.365],
  },
  {
    id: "mono", name: "Black and white",
    description: "A single fine border and no colour: prints cleanly on any printer.",
    serif: true, frame: "single",
    primary: [0, 0, 0], rule: [0, 0, 0],
    paper: [1, 1, 1], ink: [0, 0, 0], muted: [0.25, 0.25, 0.25],
  },
];

/** What an owner may change on a template. Every text field is optional. */
export interface CertificateDesign {
  template: CertificateTemplateId;
  /** '#rrggbb', or null for the template's own colour. */
  accent: string | null;
  heading: string;
  lead: string;
  statement: string;
  issuedBy: string;
  signatoryName: string;
  signatoryTitle: string;
}

export const DESIGN_TEXT_MAX = 80;
const HEX = /^#[0-9a-f]{6}$/i;

/**
 * Turn whatever is stored into a design that is safe to draw.
 *
 * The stored value is written by a register's owner and read by everybody who
 * issues a certificate from it, so nothing in it is taken on trust: the
 * template must be one that exists, the colour must be a plain hex colour, and
 * each piece of wording is folded to what the PDF font can encode and capped.
 */
export function normaliseDesign(raw: unknown): CertificateDesign {
  const r = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const text = (v: unknown) => (typeof v === "string" ? safeText(v).slice(0, DESIGN_TEXT_MAX) : "");
  const template = CERTIFICATE_TEMPLATES.some((t) => t.id === r.template)
    ? (r.template as CertificateTemplateId) : "classic";
  return {
    template,
    accent: typeof r.accent === "string" && HEX.test(r.accent) ? r.accent.toLowerCase() : null,
    heading: text(r.heading),
    lead: text(r.lead),
    statement: text(r.statement),
    issuedBy: text(r.issuedBy),
    signatoryName: text(r.signatoryName),
    signatoryTitle: text(r.signatoryTitle),
  };
}

/** Only the fields that differ from a blank design, for storing. */
export function designToStore(design: CertificateDesign): Record<string, string> {
  const clean = normaliseDesign(design);
  const out: Record<string, string> = { template: clean.template };
  if (clean.accent) out.accent = clean.accent;
  for (const key of ["heading", "lead", "statement", "issuedBy", "signatoryName", "signatoryTitle"] as const) {
    if (clean[key]) out[key] = clean[key];
  }
  return out;
}

export function hexToRgb(hex: string): Rgb {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** The colours a design is drawn in: its template's, with the accent applied. */
export function certificateColours(design: CertificateDesign) {
  const template = CERTIFICATE_TEMPLATES.find((t) => t.id === design.template)!;
  // A black-and-white certificate stays black and white whatever was chosen.
  const primary = design.accent && template.id !== "mono" ? hexToRgb(design.accent) : template.primary;
  return { template, primary, rule: template.rule ?? primary };
}

export interface CertificateContent {
  eyebrow: string;
  heading: string;
  lead: string;
  recipient: string;
  statement: string;
  sessionLine: string;
  whenLine: string;
  footerLeft: string;
  footerRight: string | null;
}

/* ------------------------------------------------------------------ colours */
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
 * Fold text down to what a standard PDF font can encode.
 *
 * Standard fonts are WinAnsi. pdf-lib throws on anything outside it, so a
 * trainee whose name carries a character it cannot represent would get no
 * certificate at all rather than an imperfect one. Accents are stripped to
 * their base letters and the typographic punctuation this application uses —
 * the en dash in specialty names, curly quotes — is folded to ASCII.
 */
/**
 * Latin letters that NFKD does not take apart and Latin-1 has no room for.
 *
 * An improvement on the original, which dropped these silently: a Polish
 * trainee called Łukasz got a certificate reading "ukasz". Ø, Æ and ß are
 * absent deliberately — they are in Latin-1 already and survive untouched.
 */
const UNDECOMPOSABLE: Record<string, string> = {
  "\u0141": "L", "\u0142": "l",   // Ł ł
  "\u0110": "D", "\u0111": "d",   // Đ đ
  "\u0126": "H", "\u0127": "h",   // Ħ ħ
  "\u0166": "T", "\u0167": "t",   // Ŧ ŧ
  "\u0131": "i",                  // ı
  "\u0152": "OE", "\u0153": "oe", // Œ œ
};

export function safeText(text: unknown): string {
  return String(text ?? "")
    .replace(/[\u0141\u0142\u0110\u0111\u0126\u0127\u0166\u0167\u0131\u0152\u0153]/g,
             (c) => UNDECOMPOSABLE[c] ?? c)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
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

/**
 * Every word that ends up on the certificate.
 *
 * The eyebrow and the footer are where the original named ENT. Both are built
 * from the register, so a certificate says who actually issued it.
 */
export function certificateContent(details: CertificateDetails): CertificateContent {
  const register = safeText(details.registerName) || "Teaching register";
  const deanery = safeText(details.deaneryName);
  const location = safeText(details.location ?? "");
  const reference = safeText(details.reference ?? "");
  const design = normaliseDesign(details.design);
  const signatory = [design.signatoryName, design.signatoryTitle].filter(Boolean).join(", ");

  const when = formatCertificateDate(details.sessionDate)
    + (location ? `  -  ${location}` : "");

  return {
    eyebrow: (deanery ? `${deanery} - ${register}` : register).toUpperCase(),
    heading: design.heading || "Certificate of Attendance",
    lead: design.lead || "This is to certify that",
    recipient: safeText(details.traineeName) || "Attendee",
    statement: design.statement || "attended the teaching session",
    sessionLine: safeText(details.sessionTitle) || "Teaching session",
    whenLine: when,
    footerLeft: design.issuedBy || `Issued by ${register}`,
    // A reference, where the register uses them; otherwise whoever signs it off.
    footerRight: reference ? `Ref ${reference}` : signatory || null,
  };
}

/* ------------------------------------------------------------------- layout */

export const PAGE = { width: 842, height: 595 } as const;
/** Inner gold border, and the footer rule: the band the composition sits in. */
const TOP_LIMIT = PAGE.height - 34;
const FOOT_RULE_Y = 82;

/** Distance from the eyebrow baseline down to the "when" baseline. */
const TEXT_BLOCK_DROP = 48 + 22 + 52 + 48 + 38 + 38 + 30;
/** Rough ink above the eyebrow baseline and below the last line. */
const ASCENT = 11;
const DESCENT = 4;
/** Gap between the badge and the eyebrow. */
export const LOGO_GAP = 20;

export interface CertificateLayout {
  /** Baseline the eyebrow sits on; everything else follows from it. */
  eyebrowY: number;
  /** Vertical space the badge occupies above it, zero when there is none. */
  logoBlock: number;
}

/**
 * Where the composition sits on the page.
 *
 * The original started at a fixed `height - 100` and moved down only if there
 * was a badge — so a register without one got the badge's space as dead air at
 * the foot, with the whole block riding high. This centres the composition in
 * the band between the inner border and the footer rule instead, so a
 * certificate with no logo closes up rather than looking unfinished, and one
 * with a logo lands within a few points of where the original put it.
 */
export function certificateLayout(logoHeight = 0): CertificateLayout {
  const logoBlock = logoHeight > 0 ? logoHeight + LOGO_GAP : 0;
  const blockHeight = logoBlock + ASCENT + TEXT_BLOCK_DROP + DESCENT;
  const bandCentre = (FOOT_RULE_Y + TOP_LIMIT) / 2;
  // Top of the whole composition, then down past the badge to the eyebrow.
  const blockTop = bandCentre + blockHeight / 2;
  return { eyebrowY: blockTop - logoBlock - ASCENT, logoBlock };
}

/**
 * Draw the certificate.
 *
 * pdf-lib is about a megabyte, and nobody who is not issuing a certificate
 * should pay for it, so it is imported here rather than at module scope.
 */
export async function renderCertificatePdf(details: CertificateDetails): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
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

  const design = normaliseDesign(details.design);
  const { template, primary, rule } = certificateColours(design);

  const colour = (c: readonly [number, number, number]) => rgb(c[0], c[1], c[2]);
  const INK = colour(template.ink);
  const PRIMARY = colour(primary);
  const RULE = colour(rule);
  const PAPER = colour(template.paper);
  const MUTED = colour(template.muted);

  // The ceremonial lines: Times on a serif template, Helvetica otherwise.
  const display = template.serif ? serif : sans;
  const displayBold = template.serif ? serifBold : sansBold;

  /** Centre a line, shrinking it only if it would otherwise run into the border. */
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
  if (template.frame === "double") {
    page.drawRectangle({
      x: 26, y: 26, width: width - 52, height: height - 52,
      // The original's border is a lighter moss than its headings; a chosen
      // accent is used as it is.
      borderColor: design.accent ? PRIMARY : colour(CERTIFICATE_PALETTE.moss), borderWidth: 2.5,
    });
    page.drawRectangle({
      x: 34, y: 34, width: width - 68, height: height - 68,
      borderColor: RULE, borderWidth: 0.9,
    });
  } else if (template.frame === "single") {
    page.drawRectangle({
      x: 30, y: 30, width: width - 60, height: height - 60,
      borderColor: RULE, borderWidth: 1,
    });
  } else {
    // A band across the head and a thin echo of it at the foot.
    page.drawRectangle({ x: 0, y: height - 22, width, height: 22, color: PRIMARY });
    page.drawRectangle({ x: 0, y: 0, width, height: 6, color: PRIMARY });
  }

  // The badge, if this register has one. A logo that will not load must never
  // block a certificate — the layout simply closes up around its absence.
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
      x: (width - w) / 2,
      y: cursor + LOGO_GAP,
      width: w,
      height: logoHeight,
    });
  }

  centre(content.eyebrow, sansBold, 11, cursor);
  cursor -= 48;
  centre(content.heading, displayBold, template.serif ? 36 : 34, cursor, PRIMARY);
  cursor -= 22;
  page.drawLine({
    start: { x: width / 2 - 90, y: cursor }, end: { x: width / 2 + 90, y: cursor },
    thickness: 1.4, color: RULE,
  });

  cursor -= 52;
  centre(content.lead, display, 14.5, cursor, MUTED);
  cursor -= 48;
  centre(content.recipient, displayBold, 32, cursor);
  cursor -= 38;
  centre(content.statement, display, 14.5, cursor, MUTED);
  cursor -= 38;
  centre(content.sessionLine, sansBold, 18, cursor, PRIMARY);
  cursor -= 30;
  centre(content.whenLine, sans, 13, cursor, MUTED);

  page.drawLine({
    start: { x: 70, y: FOOT_RULE_Y + 20 }, end: { x: width - 70, y: FOOT_RULE_Y + 20 },
    thickness: 0.6, color: RULE,
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

  return pdf.save();
}

/** A filename that sorts sensibly and survives every filesystem. */
export function certificateFilename(details: CertificateDetails): string {
  const slug = (value: string) =>
    safeText(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const name = slug(details.traineeName) || "attendee";
  return `certificate-${name}-${details.sessionDate}.pdf`;
}

/**
 * Bytes to base64, for handing a rendered PDF to the email function.
 *
 * Chunked rather than `String.fromCharCode(...bytes)`, which passes every byte
 * as a separate argument and blows the call-stack limit somewhere around a
 * hundred thousand of them.
 */
export function bytesToBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}
