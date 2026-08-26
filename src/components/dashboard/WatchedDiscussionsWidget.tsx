import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/useUserRole";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Eye, MessageSquare } from "lucide-react";

export function WatchedDiscussionsWidget() {
  const { data: user } = useCurrentUser();

  const { data: watched } = useQuery({
    queryKey: ["my-watched-discussions", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("watched_discussions")
        .select("*, discussions(id, title, specialty_id, created_at, specialties(short_name))")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(8);
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  if (!watched?.length) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Eye className="h-4 w-4 text-primary" />
            Watched Discussions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-4">
            No watched threads yet. Watch discussions to track them here.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Eye className="h-4 w-4 text-primary" />
          Watched Discussions
          <Badge variant="secondary" className="text-[10px] ml-auto">{watched.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {watched.map((w: any) => {
          const d = w.discussions;
          if (!d) return null;
          return (
            <Link
              key={w.id}
              to={`/specialty/${d.specialty_id}#discussion`}
              className="flex items-center gap-3 p-2 rounded-md hover:bg-secondary/50 transition-colors group"
            >
              <MessageSquare className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">{d.title}</p>
                <p className="text-xs text-muted-foreground">{d.specialties?.short_name}</p>
              </div>
            </Link>
          );
        })}
      </CardContent>
    </Card>
  );
}
