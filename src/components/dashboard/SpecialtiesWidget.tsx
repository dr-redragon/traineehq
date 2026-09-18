import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ChevronRight, Stethoscope } from "lucide-react";
import { WidgetSection, WidgetEmpty } from "@/components/dashboard/WidgetSection";
import { Badge } from "@/components/ui/badge";
import { getIcon } from "@/lib/iconMap";
import { useDeanery } from "@/contexts/DeaneryContext";

export function SpecialtiesWidget() {
  const { activeDeanery } = useDeanery();
  const { data: specialties } = useQuery({
    queryKey: ["my-specialties", activeDeanery?.id],
    queryFn: async () => {
      let query = supabase.from("specialties").select("*").eq("is_active", true).is("deleted_at", null).order("sort_order");
      if (activeDeanery) query = query.eq("deanery_id", activeDeanery.id);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!activeDeanery,
  });

  const topLevel = specialties?.filter((s) => !(s as any).parent_specialty_id) ?? [];
  const childrenOf = (parentId: string) =>
    specialties?.filter((s) => (s as any).parent_specialty_id === parentId) ?? [];

  return (
    <WidgetSection icon={Stethoscope} title="Your Specialties" count={topLevel.length || undefined}>
      {!specialties?.length ? (
        <WidgetEmpty>No specialties assigned yet. Contact your administrator.</WidgetEmpty>
      ) : (
        <div className="space-y-6">
          {topLevel.map((s) => {
            const SIcon = getIcon(s.icon_name);
            const color = s.color ?? "174 60% 40%";
            const children = childrenOf(s.id);
            return (
              <div key={s.id}>
                <Link
                  to={`/specialty/${s.id}`}
                  className="group mb-3 flex items-center gap-4 border-l-2 border-transparent bg-card p-4 transition-colors hover:border-rule hover:bg-accent"
                >
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center"
                    style={{ backgroundColor: `hsl(${color} / 0.12)` }}
                  >
                    <SIcon className="h-5 w-5" style={{ color: `hsl(${color})` }} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-display text-[15px] font-extrabold tracking-tight">{s.short_name}</h3>
                    <p className="line-clamp-1 text-xs text-muted-foreground">{s.name}</p>
                  </div>
                  {children.length > 0 && (
                    <Badge variant="secondary">{children.length} subspecialties</Badge>
                  )}
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-rule" />
                </Link>
                {children.length > 0 && (
                  <div className="ds-grid ml-6 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
                    {children.map((child) => {
                      const CIcon = getIcon(child.icon_name);
                      const cColor = child.color ?? "174 60% 40%";
                      return (
                        <Link
                          key={child.id}
                          to={`/specialty/${child.id}`}
                          className="group h-full p-3 transition-colors hover:bg-accent"
                        >
                          <div
                            className="mb-2 flex h-8 w-8 items-center justify-center"
                            style={{ backgroundColor: `hsl(${cColor} / 0.12)` }}
                          >
                            <CIcon className="h-4 w-4" style={{ color: `hsl(${cColor})` }} />
                          </div>
                          <h4 className="break-words text-xs font-medium leading-snug">{child.short_name}</h4>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </WidgetSection>
  );
}
