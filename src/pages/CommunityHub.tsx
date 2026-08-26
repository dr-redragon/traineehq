import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MessageSquare, Users } from "lucide-react";
import { getIcon } from "@/lib/iconMap";
import { useDeanery } from "@/contexts/DeaneryContext";

const CommunityHub = () => {
  const { activeDeanery } = useDeanery();
  const { data: specialties, isLoading } = useQuery({
    queryKey: ["community-specialties", activeDeanery?.id],
    queryFn: async () => {
      let query = supabase
        .from("specialties")
        .select("id, name, short_name, icon_name, color, parent_specialty_id, sort_order")
        .eq("is_active", true)
        .order("sort_order");
      if (activeDeanery) query = query.eq("deanery_id", activeDeanery.id);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!activeDeanery,
  });

  // Count discussions per specialty
  const specialtyIds = specialties?.map((s) => s.id) ?? [];
  const { data: discussionCounts } = useQuery({
    queryKey: ["discussion-counts", specialtyIds],
    queryFn: async () => {
      if (!specialtyIds.length) return {};
      const { data, error } = await supabase
        .from("discussions")
        .select("specialty_id");
      if (error) throw error;
      const counts: Record<string, number> = {};
      data.forEach((d) => {
        counts[d.specialty_id] = (counts[d.specialty_id] || 0) + 1;
      });
      return counts;
    },
    enabled: specialtyIds.length > 0,
  });

  const topLevel = specialties?.filter((s) => !s.parent_specialty_id) ?? [];
  const childrenOf = (parentId: string) =>
    specialties?.filter((s) => s.parent_specialty_id === parentId) ?? [];

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto space-y-6 animate-fade-in">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <MessageSquare className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-display font-bold">Discussion Boards</h1>
            <p className="text-sm text-muted-foreground">
              Join conversations with fellow trainees across your specialties
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">Loading communities…</div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
            {(specialties ?? []).map((spec) => {
              const SIcon = getIcon(spec.icon_name);
              const sColor = spec.color ?? "174 60% 40%";
              const count = discussionCounts?.[spec.id] ?? 0;

              return (
                <Link key={spec.id} to={`/specialty/${spec.id}#discussion`}>
                  <Card className="hover:shadow-md transition-all hover:border-primary/30 cursor-pointer group h-full">
                    <CardContent className="p-4 flex items-start gap-3">
                      <div
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg mt-0.5"
                        style={{ backgroundColor: `hsl(${sColor} / 0.12)` }}
                      >
                        <SIcon className="h-4 w-4" style={{ color: `hsl(${sColor})` }} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sm group-hover:text-primary transition-colors truncate">
                          {spec.short_name}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">{spec.name}</p>
                        <div className="flex items-center gap-2 mt-2">
                          <Badge variant="secondary" className="text-[10px] gap-1">
                            <MessageSquare className="h-2.5 w-2.5" />
                            {count} {count === 1 ? "thread" : "threads"}
                          </Badge>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default CommunityHub;
