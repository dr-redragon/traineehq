import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getIcon } from "@/lib/iconMap";
import { useDeanery } from "@/contexts/DeaneryContext";

export function SpecialtiesWidget() {
  const { activeDeanery } = useDeanery();
  const { data: specialties } = useQuery({
    queryKey: ["my-specialties", activeDeanery?.id],
    queryFn: async () => {
      let query = supabase.from("specialties").select("*").eq("is_active", true).order("sort_order");
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
    <div>
      <h2 className="text-lg font-display font-semibold mb-4">Your Specialties</h2>
      {!specialties?.length ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No specialties assigned yet. Contact your administrator.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {topLevel.map((s) => {
            const SIcon = getIcon(s.icon_name);
            const color = s.color ?? "174 60% 40%";
            const children = childrenOf(s.id);
            return (
              <div key={s.id}>
                <Link to={`/specialty/${s.id}`}>
                  <Card className="group hover:shadow-md hover:border-accent/40 transition-all duration-200 cursor-pointer mb-3">
                    <CardContent className="p-5 flex items-center gap-4">
                      <div
                        className="flex h-10 w-10 items-center justify-center rounded-lg transition-transform group-hover:scale-110"
                        style={{ backgroundColor: `hsl(${color} / 0.12)` }}
                      >
                        <SIcon className="h-5 w-5" style={{ color: `hsl(${color})` }} />
                      </div>
                      <div className="flex-1">
                        <h3 className="font-semibold text-sm group-hover:text-accent transition-colors">{s.short_name}</h3>
                        <p className="text-xs text-muted-foreground line-clamp-1">{s.name}</p>
                      </div>
                      {children.length > 0 && (
                        <Badge variant="secondary" className="text-[10px]">{children.length} subspecialties</Badge>
                      )}
                      <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-accent transition-colors" />
                    </CardContent>
                  </Card>
                </Link>
                {children.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 ml-6 pl-4 border-l-2 border-muted">
                    {children.map((child) => {
                      const CIcon = getIcon(child.icon_name);
                      const cColor = child.color ?? "174 60% 40%";
                      return (
                        <Link key={child.id} to={`/specialty/${child.id}`}>
                          <Card className="group hover:shadow-sm hover:border-accent/30 transition-all duration-200 cursor-pointer h-full">
                            <CardContent className="p-3">
                              <div
                                className="flex h-8 w-8 items-center justify-center rounded-md mb-2 transition-transform group-hover:scale-110"
                                style={{ backgroundColor: `hsl(${cColor} / 0.12)` }}
                              >
                                <CIcon className="h-4 w-4" style={{ color: `hsl(${cColor})` }} />
                              </div>
                              <h4 className="text-xs font-medium group-hover:text-accent transition-colors leading-snug break-words">{child.short_name}</h4>
                            </CardContent>
                          </Card>
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
    </div>
  );
}
