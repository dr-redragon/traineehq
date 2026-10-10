import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/useUserRole";
import { Mail, Phone, Star, Pencil, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { contactCategories } from "@/lib/contacts";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";

interface ContactCardProps {
  contact: Tables<"contacts">;
  /** Shown when the viewer may edit this contact. */
  onEdit?: () => void;
  /** Shown when the viewer may remove this contact. */
  onDelete?: () => void;
  /** A short note under the organisation, e.g. that it shows on every specialty. */
  note?: string;
}

export function ContactCard({ contact, onEdit, onDelete, note }: ContactCardProps) {
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
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-accent group-hover:bg-accent transition-colors">
            <Icon className="h-5 w-5 text-rule" />
          </div>
          <div className="flex-1 min-w-0 space-y-1.5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold">{contact.name}</h3>
                <p className="text-xs text-muted-foreground">{contact.role}</p>
                {/* Under the role rather than beside the buttons: a label as
                    long as "Training Programme Director" next to three icon
                    buttons pushed the last one off the card. */}
                {category && (
                  <Badge variant="secondary" className="mt-1.5 text-[10px]">
                    {category.label}
                  </Badge>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className={`h-7 w-7 shrink-0 ${isStarred ? "text-yellow-500" : "text-muted-foreground hover:text-yellow-500"}`}
                  onClick={() => toggleStar.mutate()}
                  title={isStarred ? "Unstar contact" : "Star contact"}
                >
                  <Star className={`h-4 w-4 ${isStarred ? "fill-current" : ""}`} />
                </Button>
                {onEdit && (
                  <Button
                    variant="ghost" size="icon" className="h-7 w-7 shrink-0"
                    onClick={onEdit} title="Edit contact" aria-label={`Edit ${contact.name}`}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                )}
                {onDelete && (
                  <Button
                    variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={onDelete} title="Remove contact" aria-label={`Remove ${contact.name}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>
            {contact.organisation && (
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <span className="inline-block h-1.5 w-1.5 bg-rule" />
                {contact.organisation}
              </p>
            )}
            {note && <p className="text-[11px] italic text-muted-foreground">{note}</p>}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1">
              <a href={`mailto:${contact.email}`} className="text-xs text-muted-foreground hover:text-accent-deep flex items-center gap-1.5 transition-colors">
                <Mail className="h-3 w-3" />
                {contact.email}
              </a>
              {contact.phone && (
                <a href={`tel:${contact.phone.replace(/\s+/g, "")}`} className="text-xs text-muted-foreground hover:text-accent-deep flex items-center gap-1.5 transition-colors">
                  <Phone className="h-3 w-3" />
                  {contact.phone}
                </a>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
