import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/useUserRole";
import { Mail, Phone, ExternalLink, Star } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { contactCategories, obfuscateEmail } from "@/lib/contacts";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";

interface ContactCardProps {
  contact: Tables<"contacts">;
}

export function ContactCard({ contact }: ContactCardProps) {
  const { data: user } = useCurrentUser();
  const queryClient = useQueryClient();
  const category = contactCategories.find((c) => c.key === contact.category);
  const Icon = category?.icon ?? Mail;

  const { data: isStarred } = useQuery({
    queryKey: ["star-status", contact.id, user?.id],
    queryFn: async () => {
      if (!user) return false;
      const { data } = await supabase
        .from("starred_contacts")
        .select("id")
        .eq("user_id", user.id)
        .eq("contact_id", contact.id)
        .maybeSingle();
      return !!data;
    },
    enabled: !!user,
  });

  const toggleStar = useMutation({
    mutationFn: async () => {
      if (!user) return;
      if (isStarred) {
        await supabase
          .from("starred_contacts")
          .delete()
          .eq("user_id", user.id)
          .eq("contact_id", contact.id);
      } else {
        await supabase
          .from("starred_contacts")
          .insert({ user_id: user.id, contact_id: contact.id });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["star-status", contact.id] });
      queryClient.invalidateQueries({ queryKey: ["my-starred-contacts"] });
      toast.success(isStarred ? "Contact unstarred" : "Contact starred");
    },
  });

  return (
    <Card className="hover:shadow-md transition-all duration-200 group">
      <CardContent className="p-5">
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent/10 group-hover:bg-accent/20 transition-colors">
            <Icon className="h-5 w-5 text-accent" />
          </div>
          <div className="flex-1 min-w-0 space-y-1.5">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold">{contact.name}</h3>
                <p className="text-xs text-muted-foreground">{contact.role}</p>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className={`h-7 w-7 shrink-0 ${isStarred ? "text-yellow-500" : "text-muted-foreground hover:text-yellow-500"}`}
                  onClick={() => toggleStar.mutate()}
                  title={isStarred ? "Unstar contact" : "Star contact"}
                >
                  <Star className={`h-4 w-4 ${isStarred ? "fill-current" : ""}`} />
                </Button>
                {category && (
                  <Badge variant="secondary" className="text-[10px] shrink-0">
                    {category.label}
                  </Badge>
                )}
              </div>
            </div>
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent/50" />
              {contact.organisation}
            </p>
            <div className="flex items-center gap-4 pt-1">
              <a href={`mailto:${contact.email}`} className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1.5 transition-colors">
                <Mail className="h-3 w-3" />
                {contact.email}
              </a>
              {contact.phone && (
                <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Phone className="h-3 w-3" />
                  {contact.phone}
                </span>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
