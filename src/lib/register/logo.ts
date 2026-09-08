import { supabase } from "@/integrations/supabase/client";

/** Public-read bucket: a deanery crest is branding, not personal data. */
export const REGISTER_LOGO_BUCKET = "register-logos";

/** What the bucket accepts, and what pdf-lib can actually embed. */
export const LOGO_MIME_TYPES = ["image/png", "image/jpeg"] as const;
export const LOGO_MAX_BYTES = 2 * 1024 * 1024;

/**
 * The badge's public URL, or null when the register has none.
 *
 * Public rather than signed because the certificate is drawn in the browser and
 * the logo has to be fetchable at that moment; a signed URL would expire and
 * turn a certificate issued months later into one with no badge.
 */
export function registerLogoUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return supabase.storage.from(REGISTER_LOGO_BUCKET).getPublicUrl(path).data.publicUrl;
}

/** Where a register's badge lives. The first segment is what the storage policy checks. */
export function registerLogoPath(registerId: string, fileName: string): string {
  const ext = fileName.toLowerCase().endsWith(".jpg") || fileName.toLowerCase().endsWith(".jpeg")
    ? "jpg"
    : "png";
  return `${registerId}/${crypto.randomUUID()}.${ext}`;
}

/** Why a file was refused, or null if it is fine. */
export function rejectLogo(file: File): string | null {
  if (!(LOGO_MIME_TYPES as readonly string[]).includes(file.type)) {
    // SVG is the tempting one to allow and the wrong one: pdf-lib embeds PNG
    // and JPEG only, so an SVG would upload happily and then be missing from
    // every certificate.
    return "Use a PNG or a JPEG. Those are the two a certificate can embed.";
  }
  if (file.size > LOGO_MAX_BYTES) {
    return `That file is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is 2 MB.`;
  }
  return null;
}
