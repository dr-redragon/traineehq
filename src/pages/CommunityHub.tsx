import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/DashboardLayout";
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
        .is("deleted_at", null)
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
        <div className="border-b-2 border-border pb-4">
          <p className="ds-kicker mb-2">Community</p>
          <h1 className="font-display text-[42px] font-extrabold leading-[1.05] tracking-tight">
            Discussion Boards
          </h1>
          <p className="mt-1 text-muted-foreground">
            Join conversations with fellow trainees across your specialties
          </p>
        </div>

        {isLoading ? (
          <p className="py-10 text-sm text-muted-foreground">Loading communities…</p>
        ) : (
          <div className="ds-grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
            {(specialties ?? []).map((spec) => {
              const SIcon = getIcon(spec.icon_name);
              const sColor = spec.color ?? "174 60% 40%";
              const count = discussionCounts?.[spec.id] ?? 0;

              return (
                <Link
                  key={spec.id}
                  to={`/specialty/${spec.id}#discussion`}
                  className="group flex h-full items-start gap-3 p-4 transition-colors hover:bg-foreground/[0.04]"
                >
                  <div
                    className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center"
                    style={{ backgroundColor: `hsl(${sColor} / 0.12)` }}
                  >
                    <SIcon className="h-4 w-4" style={{ color: `hsl(${sColor})` }} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-display text-sm font-extrabold tracking-tight">
                      {spec.short_name}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">{spec.name}</p>
                    <div className="mt-2 flex items-center gap-2">
                      <Badge variant="secondary" className="gap-1">
                        <MessageSquare className="h-2.5 w-2.5" />
                        {count} {count === 1 ? "thread" : "threads"}
                      </Badge>
                    </div>
                  </div>
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
