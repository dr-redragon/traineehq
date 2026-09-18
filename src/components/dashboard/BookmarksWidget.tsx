import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/useUserRole";
import { Badge } from "@/components/ui/badge";
import { WidgetSection, WidgetEmpty } from "@/components/dashboard/WidgetSection";
import { Bookmark, ExternalLink } from "lucide-react";

export function BookmarksWidget() {
  const { data: user } = useCurrentUser();

  const { data: bookmarks } = useQuery({
    queryKey: ["my-bookmarks", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("bookmarks")
        .select("*, resources(id, title, resource_type, subsection_id, subsections(specialty_id, specialties(short_name)))")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(8);
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  if (!bookmarks?.length) {
    return (
      <WidgetSection icon={Bookmark} title="Bookmarked Resources">
        <WidgetEmpty>
          No bookmarks yet. Star resources to save them here.
        </WidgetEmpty>
      </WidgetSection>
    );
  }

  return (
    <WidgetSection icon={Bookmark} title="Bookmarked Resources" count={bookmarks.length}>
      <div className="divide-y divide-border">
        {bookmarks.map((b: any) => {
          const r = b.resources;
          if (!r) return null;
          const specName = r.subsections?.specialties?.short_name ?? "";
          const specId = r.subsections?.specialty_id;
          return (
            <Link
              key={b.id}
              to={specId ? `/specialty/${specId}` : "#"}
              className="group flex items-center gap-3 px-1 py-2 transition-colors hover:bg-foreground/[0.04]"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate transition-colors group-hover:text-rule">{r.title}</p>
                <p className="text-xs text-muted-foreground">{specName}</p>
              </div>
              <Badge variant="outline" className="text-[9px] shrink-0">{r.resource_type}</Badge>
              <ExternalLink className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            </Link>
          );
        })}
      </div>
    </WidgetSection>
  );
}
