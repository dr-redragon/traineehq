import {
  BookOpen, CheckSquare, File, FileText, FolderOpen, LinkIcon, Presentation, Video,
  type LucideIcon,
} from "lucide-react";

/**
 * The icon for a resource type, drawn plain at the start of a file row.
 *
 * In the file browser it is what keeps files and folders in one column: a
 * folder row leads with its folder icon, so a file row leads with one of these
 * in the same slot rather than starting its name further left.
 */
const ICONS: Record<string, LucideIcon> = {
  pdf: FileText,
  document: BookOpen,
  video: Video,
  link: LinkIcon,
  presentation: Presentation,
  checklist: CheckSquare,
  folder: FolderOpen,
};

export function resourceTypeIcon(type: string | null | undefined): LucideIcon {
  return (type && ICONS[type]) || File;
}
