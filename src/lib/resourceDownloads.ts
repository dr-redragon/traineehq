import type { Tables } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";
import { extractStoragePath } from "@/lib/storageUtils";

type ResourceRecord = Tables<"resources">;

interface ZipDownloadItem {
  resource: ResourceRecord;
  folderName?: string | null;
}

const INVALID_FILE_CHARS = /[\\/:*?"<>|]+/g;
const CONTROL_CHARS = /[\u0000-\u001f\u007f]+/g;
const MULTIPLE_SPACES = /\s+/g;

function sanitizeSegment(value: string | null | undefined, fallback: string) {
  const sanitized = (value ?? "")
    .replace(INVALID_FILE_CHARS, "-")
    .replace(CONTROL_CHARS, "")
    .replace(MULTIPLE_SPACES, " ")
    .trim();
  return sanitized || fallback;
}

function extractSourceFileName(source: string) {
  const rawName = source.split("/").pop()?.split("?")[0] ?? "";
  try {
    return decodeURIComponent(rawName);
  } catch {
    return rawName;
  }
}

function splitFileName(fileName: string) {
  const i = fileName.lastIndexOf(".");
  if (i <= 0) return { base: fileName, extension: "" };
  return { base: fileName.slice(0, i), extension: fileName.slice(i) };
}

function isSafariBrowser() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /Safari/i.test(ua) && !/Chrome|Chromium|CriOS|FxiOS|EdgiOS|Edg\//i.test(ua);
}

function openDownloadWindow() {
  if (!isSafariBrowser() || typeof window === "undefined") return null;

  const popup = window.open("", "_blank");
  if (!popup) return null;

  try {
    popup.document.title = "Preparing download…";
    popup.document.body.innerHTML = "Preparing your download…";
  } catch {
    /* ignore */
  }

  return popup;
}

function getResourceSource(r: ResourceRecord) {
  return r.file_url || r.external_url || null;
}

function getResourceBaseName(r: ResourceRecord) {
  const sourceName = extractSourceFileName(getResourceSource(r) ?? "");
  return sanitizeSegment(r.title || splitFileName(sourceName).base, "resource");
}

function getResourceExtension(r: ResourceRecord) {
  const sourceName = extractSourceFileName(getResourceSource(r) ?? "");
  return splitFileName(sourceName).extension.toLowerCase();
}

export function getResourceDownloadName(r: ResourceRecord) {
  const base = getResourceBaseName(r);
  const ext = getResourceExtension(r);
  if (!ext || base.toLowerCase().endsWith(ext)) return base;
  return `${base}${ext}`;
}

/**
 * Save a Blob to disk via an anchor click on a same-origin blob: URL.
 *
 * Why this works in Safari (including inside the Lovable preview iframe):
 * - The blob: URL is same-origin to the document, so the `download`
 *   attribute is honoured (cross-origin URLs cause Safari to ignore it).
 * - We trigger the click synchronously inside the user-gesture callback
 *   that called us — no async gap between gesture and click.
 *
 * This is the approach used by Google Drive's web client for client-built ZIPs.
 */
function saveBlobAsFile(blob: Blob, fileName: string, popup?: Window | null) {
  const url = URL.createObjectURL(blob);

  if (popup && !popup.closed) {
    try {
      popup.location.href = url;
      setTimeout(() => {
        try {
          if (!popup.closed) popup.close();
        } catch {
          /* ignore */
        }
      }, 1500);
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
      return;
    } catch {
      try {
        popup.close();
      } catch {
        /* ignore */
      }
    }
  }

  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Revoke after the browser has had time to start the download.
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/**
 * Single-file download (Google Drive style):
 * 1. Fetch the file as a Blob via the Supabase SDK (uses auth + RLS, same-origin to the SDK).
 * 2. Save the Blob locally with a same-origin blob: URL — works in Safari.
 *
 * For external (non-storage) URLs we attempt a CORS fetch first; if that
 * fails we fall back to opening the URL in a new tab.
 */
export async function downloadResourceFile(resource: ResourceRecord) {
  const source = getResourceSource(resource);
  if (!source) throw new Error("This resource has no file to download");

  const fileName = getResourceDownloadName(resource);

  // Storage file: download via the SDK directly into a blob.
  const path = resource.file_url ? extractStoragePath(resource.file_url) : null;
  if (path) {
    const { data, error } = await supabase.storage.from("resources").download(path);
    if (error || !data) {
      throw new Error(error?.message || "Unable to download this file");
    }
    saveBlobAsFile(data, fileName);
    return fileName;
  }

  // External URL: try fetching as blob; fall back to new tab.
  if (resource.external_url) {
    try {
      const res = await fetch(resource.external_url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      saveBlobAsFile(blob, fileName);
      return fileName;
    } catch {
      window.open(resource.external_url, "_blank", "noopener,noreferrer");
      return fileName;
    }
  }

  throw new Error("Unable to download this file");
}

/**
 * Bulk / folder download (Google Drive style):
 * Calls the `zip-resources` edge function which streams files server-side
 * and returns a ZIP. We then save the resulting Blob locally — same-origin
 * blob URL means Safari saves it correctly.
 */
export async function downloadResourcesAsZip(
  items: ZipDownloadItem[],
  zipName: string,
): Promise<{ downloaded: number; skipped: string[]; skippedCount: number }> {
  const popup = openDownloadWindow();

  // Filter to items that have a storage path (the edge function uses storage).
  const payloadItems = items
    .map(({ resource, folderName }) => {
      const path = resource.file_url ? extractStoragePath(resource.file_url) : null;
      if (!path) return null;
      return {
        path,
        fileName: getResourceDownloadName(resource),
        folderName: folderName ? sanitizeSegment(folderName, "folder") : undefined,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  const externallySkipped = items
    .filter(({ resource }) => {
      const path = resource.file_url ? extractStoragePath(resource.file_url) : null;
      return !path;
    })
    .map(({ resource }) => resource.title || "Untitled");

  if (payloadItems.length === 0) {
    if (popup && !popup.closed) popup.close();
    throw new Error("No downloadable files found");
  }

  const safeZipName = sanitizeSegment(zipName.replace(/\.zip$/i, ""), "resources");

  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) {
    if (popup && !popup.closed) popup.close();
    throw new Error("You must be signed in to download files");
  }

  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/zip-resources`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    },
    body: JSON.stringify({ items: payloadItems, zipName: safeZipName }),
  });

  if (!res.ok) {
    if (popup && !popup.closed) popup.close();
    let message = "Unable to build the download";
    try {
      const err = await res.json();
      if (err?.error) message = err.error;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }

  const headerDownloaded = parseInt(res.headers.get("X-Files-Included") ?? "", 10);
  const skippedCount = parseInt(res.headers.get("X-Files-Skipped") ?? "0", 10) || 0;
  const downloaded = Number.isFinite(headerDownloaded)
    ? headerDownloaded
    : Math.max(payloadItems.length - skippedCount, 0);
  const blob = await res.blob();

  saveBlobAsFile(blob, `${safeZipName}.zip`, popup);

  // Combine server-side skips (count only) with client-side skips (with names).
  const skipped = [...externallySkipped];

  return { downloaded, skipped, skippedCount: externallySkipped.length + skippedCount };
}
