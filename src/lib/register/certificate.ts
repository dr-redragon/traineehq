/**
 * Attendance certificates.
 *
 * Deliberately not ported with the rest of the register, because the original
 * was single-tenant in a way that could not simply be copied: its footer said
 * "ENT Teaching Register", which is wrong for every other register this
 * application now hosts. The fix is not to parameterise a string — it is to
 * make the certificate take its identity from the register it belongs to, and
 * to have a test that fails if anybody hardcodes a specialty back into it.
 *
 * The wording is split from the drawing on purpose. `certificateContent` is
 * pure and tested; `renderCertificatePdf` is the pdf-lib call that cannot be
 * meaningfully asserted about. Everything that could be *wrong* — whose name,
 * which register, which date, what it claims the person did — lives in the
 * half a test can read.
 */

export interface CertificateDetails {
  traineeName: string;
  registerName: string;
  deaneryName: string;
  sessionTitle: string;
  /** ISO date (YYYY-MM-DD) of the teaching day. */
  sessionDate: string;
  location?: string | null;
}

export interface CertificateContent {
  heading: string;
  recipient: string;
  statement: string;
  sessionLine: string;
  dateLine: string;
  locationLine: string | null;
  footer: string;
}

/** "2026-09-08" -> "8 September 2026". Falls back to the raw value. */
export function formatCertificateDate(iso: string): string {
  const parsed = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleDateString("en-GB", {
    day: "numeric", month: "long", year: "numeric",
  });
}

/**
 * Every word that ends up on the certificate.
 *
 * The footer names the register and its deanery rather than any fixed
 * specialty, which is the whole reason this was not a copy-paste job.
 */
export function certificateContent(details: CertificateDetails): CertificateContent {
  const name = details.traineeName.trim() || "Attendee";
  const register = details.registerName.trim() || "Teaching register";
  const deanery = details.deaneryName.trim();
  const title = details.sessionTitle.trim() || "Teaching session";
  const location = details.location?.trim() || null;

  return {
    heading: "Certificate of Attendance",
    recipient: name,
    statement: "attended the teaching session",
    sessionLine: title,
    dateLine: `on ${formatCertificateDate(details.sessionDate)}`,
    locationLine: location ? `at ${location}` : null,
    // Deanery is appended only when there is one, so a register without a
    // deanery does not get a certificate ending in a stray separator.
    footer: deanery ? `${register} · ${deanery}` : register,
  };
}

/**
 * Draw the certificate.
 *
 * pdf-lib is about a megabyte, and nobody who is not issuing a certificate
 * should pay for it, so it is imported here rather than at module scope — the
 * same treatment `DriveBrowser` gives its upload helpers.
 */
export async function renderCertificatePdf(details: CertificateDetails): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const content = certificateContent(details);

  const pdf = await PDFDocument.create();
  pdf.setTitle(`${content.heading} — ${content.recipient}`);
  pdf.setSubject(content.footer);
  pdf.setProducer("HST Training Hub");

  // A4 landscape.
  const page = pdf.addPage([842, 595]);
  const { width, height } = page.getSize();

  const serif = await pdf.embedFont(StandardFonts.TimesRoman);
  const serifBold = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const serifItalic = await pdf.embedFont(StandardFonts.TimesRomanItalic);

  const ink = rgb(0.08, 0.13, 0.17);
  const soft = rgb(0.38, 0.44, 0.5);
  const accent = rgb(0, 0.33, 0.55);

  const centre = (text: string, font: typeof serif, size: number, y: number, color = ink) => {
    const textWidth = font.widthOfTextAtSize(text, size);
    page.drawText(text, { x: (width - textWidth) / 2, y, size, font, color });
  };

  // Border, inset from the page edge so it survives a printer's margins.
  page.drawRectangle({
    x: 28, y: 28, width: width - 56, height: height - 56,
    borderColor: accent, borderWidth: 1.5,
  });
  page.drawRectangle({
    x: 36, y: 36, width: width - 72, height: height - 72,
    borderColor: accent, borderWidth: 0.5,
  });

  centre(content.heading.toUpperCase(), serifBold, 26, height - 140, accent);

  centre("This is to certify that", serifItalic, 14, height - 200, soft);
  centre(content.recipient, serifBold, 32, height - 250);
  centre(content.statement, serifItalic, 14, height - 292, soft);

  centre(content.sessionLine, serifBold, 18, height - 336);
  centre(content.dateLine, serif, 14, height - 366, soft);
  if (content.locationLine) {
    centre(content.locationLine, serif, 12, height - 388, soft);
  }

  // Footer rule and the register's identity.
  page.drawLine({
    start: { x: width / 2 - 130, y: 132 },
    end: { x: width / 2 + 130, y: 132 },
    thickness: 0.5,
    color: soft,
  });
  centre(content.footer, serifBold, 12, 108);
  centre("HST Training Hub", serif, 9, 88, soft);

  return pdf.save();
}

/** A filename that sorts sensibly and survives every filesystem. */
export function certificateFilename(details: CertificateDetails): string {
  const slug = (value: string) =>
    value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const name = slug(details.traineeName) || "attendee";
  return `certificate-${name}-${details.sessionDate}.pdf`;
}

/**
 * Bytes to base64, for handing a rendered PDF to the email function.
 *
 * Chunked rather than `String.fromCharCode(...bytes)`, which passes every byte
 * as a separate argument and blows the call-stack limit somewhere around a
 * hundred thousand of them. A certificate is smaller than that today; the
 * failure would arrive the first time one is not.
 */
export function bytesToBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}
