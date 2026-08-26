import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/useUserRole";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Bookmark className="h-4 w-4 text-primary" />
            Bookmarked Resources
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-4">
            No bookmarks yet. Star resources to save them here.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Bookmark className="h-4 w-4 text-primary" />
          Bookmarked Resources
          <Badge variant="secondary" className="text-[10px] ml-auto">{bookmarks.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {bookmarks.map((b: any) => {
          const r = b.resources;
          if (!r) return null;
          const specName = r.subsections?.specialties?.short_name ?? "";
          const specId = r.subsections?.specialty_id;
          return (
            <Link
              key={b.id}
              to={specId ? `/specialty/${specId}` : "#"}
              className="flex items-center gap-3 p-2 rounded-md hover:bg-secondary/50 transition-colors group"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">{r.title}</p>
                <p className="text-xs text-muted-foreground">{specName}</p>
              </div>
              <Badge variant="outline" className="text-[9px] shrink-0">{r.resource_type}</Badge>
              <ExternalLink className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            </Link>
          );
        })}
      </CardContent>
    </Card>
  );
}
