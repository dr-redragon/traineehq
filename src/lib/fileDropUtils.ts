/**
 * Recursively reads files from a dropped DataTransfer, handling both files and folders.
 * Uses webkitGetAsEntry() to detect directories and traverse them.
 */

interface DroppedFileGroup {
  folderName: string | null; // null = loose file, string = parent folder name
  file: File;
}

function readEntryAsFile(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => entry.file(resolve, reject));
}

function readDirectory(dirEntry: FileSystemDirectoryEntry): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => {
    const reader = dirEntry.createReader();
    const allEntries: FileSystemEntry[] = [];
    const readBatch = () => {
      reader.readEntries((entries) => {
        if (entries.length === 0) {
          resolve(allEntries);
        } else {
          allEntries.push(...entries);
          readBatch();
        }
      }, reject);
    };
    readBatch();
  });
}

async function traverseEntry(entry: FileSystemEntry, folderName: string | null): Promise<DroppedFileGroup[]> {
  if (entry.isFile) {
    const file = await readEntryAsFile(entry as FileSystemFileEntry);
    return [{ folderName, file }];
  }
  if (entry.isDirectory) {
    const dirEntry = entry as FileSystemDirectoryEntry;
    const children = await readDirectory(dirEntry);
    const results: DroppedFileGroup[] = [];
    for (const child of children) {
      // Use the top-level folder name, not nested subfolders
      const group = await traverseEntry(child, folderName ?? dirEntry.name);
      results.push(...group);
    }
    return results;
  }
  return [];
}

export async function getDroppedFiles(dataTransfer: DataTransfer): Promise<DroppedFileGroup[]> {
  const items = dataTransfer.items;
  const results: DroppedFileGroup[] = [];

  if (items) {
    const entries: FileSystemEntry[] = [];
    for (let i = 0; i < items.length; i++) {
      const entry = items[i].webkitGetAsEntry?.();
      if (entry) entries.push(entry);
    }

    for (const entry of entries) {
      const group = await traverseEntry(entry, null);
      results.push(...group);
    }

    if (results.length > 0) return results;
  }

  // Fallback: plain files
  for (const file of Array.from(dataTransfer.files)) {
    results.push({ folderName: null, file });
  }
  return results;
}

export function detectResourceType(file: File): string {
  if (file.type === "application/pdf") return "pdf";
  if (file.type.startsWith("video/")) return "video";
  if (file.name.endsWith(".pptx") || file.name.endsWith(".ppt")) return "presentation";
  return "document";
}
