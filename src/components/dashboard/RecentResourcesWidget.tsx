import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Clock, FileText, Video, LinkIcon, BookOpen, CheckSquare, FolderOpen } from "lucide-react";
import { WidgetSection, WidgetEmpty } from "@/components/dashboard/WidgetSection";
import { Badge } from "@/components/ui/badge";
import type { LucideIcon } from "lucide-react";

const typeIcons: Record<string, LucideIcon> = {
  pdf: FileText, video: Video, link: LinkIcon, document: BookOpen,
  checklist: CheckSquare, folder: FolderOpen, presentation: BookOpen,
};

export function RecentResourcesWidget() {
  const { data: recentResources } = useQuery({
    queryKey: ["recent-resources"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("resources")
        .select("*, subsections!inner(specialty_id, specialties!inner(short_name))")
        .order("created_at", { ascending: false }).limit(5);
      if (error) throw error;
      return data;
    },
  });

  return (
    <WidgetSection icon={Clock} title="Recently Added Resources" count={recentResources?.length || undefined}>
      {!recentResources?.length ? (
        <WidgetEmpty>No resources added yet.</WidgetEmpty>
      ) : (
        <div className="divide-y divide-border">
          {recentResources.map((r: any) => {
            const Icon = typeIcons[r.resource_type] || FileText;
            const specName = r.subsections?.specialties?.short_name ?? "";
            return (
              <div
                key={r.id}
                className="flex cursor-pointer items-center gap-4 px-1 py-2.5 transition-colors hover:bg-foreground/[0.04]"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center bg-secondary">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className="truncate text-sm font-medium">{r.title}</h4>
                  <p className="text-xs text-muted-foreground">{specName}</p>
                </div>
                <Badge variant="secondary" className="shrink-0">{r.resource_type.toUpperCase()}</Badge>
                <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  {new Date(r.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </WidgetSection>
  );
}
