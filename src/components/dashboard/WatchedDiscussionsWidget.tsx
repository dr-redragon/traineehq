import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/useUserRole";
import { Badge } from "@/components/ui/badge";
import { WidgetSection, WidgetEmpty, WidgetSkeleton } from "@/components/dashboard/WidgetSection";
import { Eye, MessageSquare } from "lucide-react";

export function WatchedDiscussionsWidget() {
  const { data: user } = useCurrentUser();

  const { data: watched, isPending } = useQuery({
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

  if (!user || isPending) {
    return (
      <WidgetSection icon={Eye} title="Watched Discussions">
        <WidgetSkeleton rows={2} />
      </WidgetSection>
    );
  }

  if (!watched?.length) {
    return (
      <WidgetSection icon={Eye} title="Watched Discussions">
        <WidgetEmpty>
          No watched threads yet. Watch discussions to track them here.
        </WidgetEmpty>
      </WidgetSection>
    );
  }

  return (
    <WidgetSection icon={Eye} title="Watched Discussions" count={watched.length}>
      <div className="divide-y divide-border">
        {watched.map((w: any) => {
          const d = w.discussions;
          if (!d) return null;
          return (
            <Link
              key={w.id}
              to={`/community/${d.specialty_id}`}
              className="group flex items-center gap-3 px-1 py-2 transition-colors hover:bg-accent"
            >
              <MessageSquare className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate transition-colors group-hover:text-rule">{d.title}</p>
                <p className="text-xs text-muted-foreground">{d.specialties?.short_name}</p>
              </div>
            </Link>
          );
        })}
      </div>
    </WidgetSection>
  );
}
