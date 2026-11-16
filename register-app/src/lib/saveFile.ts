import { isNative } from "@/lib/native";

function toBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/**
 * Hand a generated file — a certificate, a CSV export — to the person.
 *
 * In a browser that is a download. A native web view has no downloads: a
 * click on a blob link does nothing at all on iOS. There the file is written
 * to the app's cache and passed to the system share sheet, which is where
 * "Save to Files", "Print" and "Mail" live.
 */
export async function saveFile(content: Uint8Array | string, filename: string, mime: string): Promise<void> {
  const bytes = typeof content === "string" ? new TextEncoder().encode(content) : content;

  if (isNative) {
    const [{ Filesystem, Directory }, { Share }] = await Promise.all([
      import("@capacitor/filesystem"), import("@capacitor/share"),
    ]);
    // A filename is built from a register's and a person's name; keep it to
    // one path segment whatever they contain.
    const safeName = filename.replace(/[^A-Za-z0-9._-]+/g, "-").slice(-120) || "file";
    const written = await Filesystem.writeFile({
      path: safeName, data: toBase64(bytes), directory: Directory.Cache,
    });
    try {
      await Share.share({ title: safeName, files: [written.uri] });
    } catch (error) {
      // Closing the share sheet without choosing anything is not a failure.
      if (!/cancel/i.test(String((error as Error)?.message))) throw error;
    }
    return;
  }

  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
