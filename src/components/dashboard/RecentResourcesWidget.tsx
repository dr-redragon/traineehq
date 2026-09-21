import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Clock, FileText, Video, LinkIcon, BookOpen, CheckSquare, FolderOpen } from "lucide-react";
import { WidgetSection, WidgetEmpty, WidgetSkeleton } from "@/components/dashboard/WidgetSection";
import { Badge } from "@/components/ui/badge";
import { abbreviatedResourceType } from "@/lib/resourceTypeLabel";
import { formatRelativeCompact } from "@/lib/relativeDate";
import type { LucideIcon } from "lucide-react";

const typeIcons: Record<string, LucideIcon> = {
  pdf: FileText, video: Video, link: LinkIcon, document: BookOpen,
  checklist: CheckSquare, folder: FolderOpen, presentation: BookOpen,
};

export function RecentResourcesWidget() {
  const { data: recentResources, isPending } = useQuery({
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
      {isPending ? (
        <WidgetSkeleton />
      ) : !recentResources?.length ? (
        <WidgetEmpty>No resources added yet.</WidgetEmpty>
      ) : (
        <div className="divide-y divide-border">
          {recentResources.map((r: any) => {
            const Icon = typeIcons[r.resource_type] || FileText;
            const specName = r.subsections?.specialties?.short_name ?? "";
            return (
              <div
                key={r.id}
                className="flex cursor-pointer items-center gap-4 px-1 py-2.5 transition-colors hover:bg-accent"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center bg-secondary">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className="truncate text-sm font-medium">{r.title}</h4>
                  <p className="text-xs text-muted-foreground">{specName}</p>
                </div>
                {/* Below sm: type over date, stacked and small, so the two of
                    them together cost less width than "DOCUMENT" alone used
                    to — which is what was squeezing the name into a sliver.
                    From sm up there is width to spare, so the original badge
                    and full date stay exactly as they were. */}
                <div className="flex shrink-0 flex-col items-end gap-0.5 sm:hidden">
                  <span className="text-[10px] leading-none text-muted-foreground">
                    {formatRelativeCompact(r.created_at)}
                  </span>
                  <span className="text-[10px] uppercase leading-none tracking-wide text-muted-foreground/70">
                    {abbreviatedResourceType(r.resource_type)}
                  </span>
                </div>
                <Badge variant="secondary" className="hidden shrink-0 sm:inline-flex">
                  {r.resource_type.toUpperCase()}
                </Badge>
                <span className="hidden shrink-0 items-center gap-1 text-xs text-muted-foreground sm:flex">
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
