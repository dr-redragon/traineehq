import { FileText, Folder, MessageSquare, Users } from "lucide-react";

import type { SearchKind } from "@/hooks/useGlobalSearch";

/** The icon for each kind of search result. A specialty draws its own. */
export const KIND_ICONS: Record<Exclude<SearchKind, "specialty">, typeof FileText> = {
  folder: Folder,
  resource: FileText,
  contact: Users,
  discussion: MessageSquare,
};
