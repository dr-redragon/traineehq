import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/useUserRole";
import { Badge } from "@/components/ui/badge";
import { WidgetSection, WidgetEmpty, WidgetSkeleton } from "@/components/dashboard/WidgetSection";
import { Star, Mail, Building2 } from "lucide-react";

export function StarredContactsWidget() {
  const { data: user } = useCurrentUser();

  const { data: starred, isPending } = useQuery({
    queryKey: ["my-starred-contacts", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("starred_contacts")
        .select("*, contacts(id, name, role, organisation, email, category)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(6);
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  

  if (!user || isPending) {
    return (
      <WidgetSection icon={Star} title="Key Contacts">
        <WidgetSkeleton rows={2} />
      </WidgetSection>
    );
  }

  if (!starred?.length) {
    return (
      <WidgetSection icon={Star} title="Key Contacts">
        <WidgetEmpty>
          No starred contacts yet. Star contacts from the Key Contacts page.
        </WidgetEmpty>
      </WidgetSection>
    );
  }

  return (
    <WidgetSection icon={Star} title="Key Contacts" count={starred.length}>
      <div className="divide-y divide-border">
        {starred.map((s: any) => {
          const c = s.contacts;
          if (!c) return null;
          return (
            <div
              key={s.id}
              className="flex items-start gap-3 px-1 py-2 transition-colors hover:bg-accent"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm bg-primary/10 text-xs font-semibold text-rule">
                {c.name.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{c.name}</p>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Building2 className="h-2.5 w-2.5" />
                  {c.organisation}
                </p>
                <a href={`mailto:${c.email}`} className="text-xs text-muted-foreground hover:text-accent-deep flex items-center gap-1 transition-colors">
                  <Mail className="h-2.5 w-2.5" />
                  {c.email}
                </a>
              </div>
            </div>
          );
        })}
      </div>
    </WidgetSection>
  );
}
