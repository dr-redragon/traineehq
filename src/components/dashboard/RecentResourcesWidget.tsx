import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Clock, FileText, Video, LinkIcon, BookOpen, CheckSquare, FolderOpen } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
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
    <div>
      <h2 className="text-lg font-display font-semibold mb-4">Recently Added Resources</h2>
      {!recentResources?.length ? (
        <p className="text-sm text-muted-foreground text-center py-8">No resources added yet.</p>
      ) : (
        <div className="space-y-2">
          {recentResources.map((r: any) => {
            const Icon = typeIcons[r.resource_type] || FileText;
            const specName = r.subsections?.specialties?.short_name ?? "";
            return (
              <Card key={r.id} className="hover:shadow-sm transition-shadow cursor-pointer">
                <CardContent className="flex items-center gap-4 p-4">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-secondary">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-medium truncate">{r.title}</h4>
                    <p className="text-xs text-muted-foreground">{specName}</p>
                  </div>
                  <Badge variant="secondary" className="text-[10px] shrink-0">{r.resource_type.toUpperCase()}</Badge>
                  <span className="text-xs text-muted-foreground shrink-0 flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {new Date(r.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                  </span>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
