import { supabase } from "@/integrations/supabase/client";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SIGNED_URL_EXPIRY = 3600; // 1 hour

/**
 * Extracts the storage path from a file_url.
 * Handles both full public URLs (legacy) and bare paths (new).
 */
export function extractStoragePath(fileUrl: string): string | null {
  if (!fileUrl) return null;

  // If it's a full Supabase storage URL, extract path after /resources/
  const publicPrefix = `${SUPABASE_URL}/storage/v1/object/public/resources/`;
  if (fileUrl.startsWith(publicPrefix)) {
    return decodeURIComponent(fileUrl.slice(publicPrefix.length));
  }

  // If it contains the storage path pattern but different format
  const match = fileUrl.match(/\/storage\/v1\/object\/(?:public|sign)\/resources\/(.+)/);
  if (match) return decodeURIComponent(match[1]);

  // If it's already a bare path (no http), return as-is
  if (!fileUrl.startsWith("http")) return fileUrl;

  // Not a storage URL (external link) — return null
  return null;
}

/**
 * Creates a signed URL for a resource file_url.
 * Returns the original URL if it's not a storage URL (e.g. external links).
 */
export async function getSignedResourceUrl(fileUrl: string): Promise<string | null> {
  const path = extractStoragePath(fileUrl);
  if (!path) return fileUrl; // external URL, return as-is

  const { data, error } = await supabase.storage
    .from("resources")
    .createSignedUrl(path, SIGNED_URL_EXPIRY);

  if (error) {
    console.error("Failed to create signed URL:", error);
    return null;
  }

  return data.signedUrl;
}

/**
 * Downloads a resource file as a Blob directly via Supabase SDK.
 * Falls back to fetch for external URLs.
 */
export async function downloadResourceBlob(fileUrl: string): Promise<Blob | null> {
  const resolvedUrl = await getSignedResourceUrl(fileUrl);
  if (!resolvedUrl) return null;

  try {
    const response = await fetch(resolvedUrl);
    if (!response.ok) return null;
    return await response.blob();
  } catch {
    return null;
  }
}

/**
 * Returns true if the file_url points to Supabase storage (vs external).
 */
export function isStorageUrl(fileUrl: string | null): boolean {
  if (!fileUrl) return false;
  return extractStoragePath(fileUrl) !== fileUrl || !fileUrl.startsWith("http");
}

/** Human-readable byte size, e.g. "1.4 GB". */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/**
 * Turns a storage upload error into something a user can act on.
 *
 * The resources bucket sets no size limit of its own, so the only remaining
 * ceiling is the project's global storage limit — a 413 from the API means the
 * file is over that, which is fixed by raising the plan limit, not by retrying.
 */
export function uploadErrorMessage(error: unknown, file: { name: string; size: number }): string {
  const err = error as { message?: string; statusCode?: string | number } | null;
  const message = err?.message ?? "Upload failed";
  const status = String(err?.statusCode ?? "");
  const tooLarge =
    status === "413" ||
    /exceeded the maximum allowed size|payload too large|entity too large/i.test(message);

  if (tooLarge) {
    return `${file.name} (${formatBytes(file.size)}) is larger than this project's storage upload limit.`;
  }
  return `${file.name}: ${message}`;
}
