import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/useUserRole";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Star, Mail, Building2 } from "lucide-react";

export function StarredContactsWidget() {
  const { data: user } = useCurrentUser();

  const { data: starred } = useQuery({
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

  

  if (!starred?.length) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Star className="h-4 w-4 text-primary" />
            Key Contacts
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-4">
            No starred contacts yet. Star contacts from the Key Contacts page.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Star className="h-4 w-4 text-primary" />
          Key Contacts
          <Badge variant="secondary" className="text-[10px] ml-auto">{starred.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {starred.map((s: any) => {
          const c = s.contacts;
          if (!c) return null;
          return (
            <div
              key={s.id}
              className="flex items-start gap-3 p-2 rounded-md hover:bg-secondary/50 transition-colors"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                {c.name.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{c.name}</p>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Building2 className="h-2.5 w-2.5" />
                  {c.organisation}
                </p>
                <a href={`mailto:${c.email}`} className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1 transition-colors">
                  <Mail className="h-2.5 w-2.5" />
                  {c.email}
                </a>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
