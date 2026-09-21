import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ChevronRight, Stethoscope } from "lucide-react";
import { WidgetSection, WidgetEmpty, WidgetSkeleton } from "@/components/dashboard/WidgetSection";
import { getIcon } from "@/lib/iconMap";
import { useDeanery } from "@/contexts/DeaneryContext";
import { specialtyColorVars } from "@/lib/specialtyColor";

export function SpecialtiesWidget() {
  const { activeDeanery } = useDeanery();
  const { data: specialties, isPending } = useQuery({
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

  // The query only runs once the deanery is known, so "not started yet" is
  // still loading as far as the reader is concerned — isPending alone would
  // have this widget claim the account has no specialties before it has asked.
  const loading = !activeDeanery || isPending;

  const topLevel = specialties?.filter((s) => !(s as any).parent_specialty_id) ?? [];
  const childrenOf = (parentId: string) =>
    specialties?.filter((s) => (s as any).parent_specialty_id === parentId) ?? [];

  return (
    <WidgetSection icon={Stethoscope} title="Your Specialties" count={topLevel.length || undefined}>
      {loading ? (
        <WidgetSkeleton />
      ) : !specialties?.length ? (
        <WidgetEmpty>No specialties assigned yet. Contact your administrator.</WidgetEmpty>
      ) : (
        // A ruled list, like every other widget on this dashboard.
        //
        // Each specialty used to be a filled card with its own left edge, and
        // its subspecialties a grid of smaller cards indented beneath — so the
        // one widget made of boxes sat among seven made of rules. Dividers do
        // the separating now, and depth is shown by indentation rather than by
        // changing the shape of the thing.
        <div className="divide-y divide-border">
          {topLevel.map((s) => {
            const SIcon = getIcon(s.icon_name);
            const color = s.color ?? "174 60% 40%";
            const children = childrenOf(s.id);
            return (
              <div key={s.id} className="divide-y divide-border">
                <Link
                  to={`/specialty/${s.id}`}
                  className="group flex items-center gap-4 px-1 py-2.5 transition-colors hover:bg-accent"
                >
                  {/* The icon alone, on the page's own ground. A tinted tile
                      behind it was the last filled shape left in a list made
                      of rules, and it put a second colour behind a mark that
                      already carries the specialty's colour. */}
                  <SIcon className="ds-spec-icon h-5 w-5 shrink-0" style={specialtyColorVars(s.color)} />
                  <div className="min-w-0 flex-1">
                    <h4 className="truncate text-sm font-medium">{s.short_name}</h4>
                    <p className="truncate text-xs text-muted-foreground">{s.name}</p>
                  </div>
                  {children.length > 0 && (
                    <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
                      {children.length} subspecialt{children.length === 1 ? "y" : "ies"}
                    </span>
                  )}
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-rule" />
                </Link>

                {children.map((child) => {
                  const CIcon = getIcon(child.icon_name);
                  const cColor = child.color ?? "174 60% 40%";
                  return (
                    <Link
                      key={child.id}
                      to={`/specialty/${child.id}`}
                      // Indented to the parent's text, so the column of names
                      // steps in rather than the row changing shape.
                      className="group flex items-center gap-4 py-2.5 pl-10 pr-1 transition-colors hover:bg-accent"
                    >
                      <CIcon className="ds-spec-icon h-3.5 w-3.5 shrink-0" style={specialtyColorVars(child.color)} />
                      <span className="min-w-0 flex-1 truncate text-[13px]">{child.short_name}</span>
                      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-colors group-hover:text-rule" />
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </WidgetSection>
  );
}
