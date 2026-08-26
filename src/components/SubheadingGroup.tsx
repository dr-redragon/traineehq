import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronDown, Pencil, Trash2, Check, X } from "lucide-react";
import { toast } from "sonner";

interface SubheadingGroupProps {
  name: string;
  resourceIds: string[];
  canManage: boolean;
  children: React.ReactNode;
}

export function SubheadingGroup({ name, resourceIds, canManage, children }: SubheadingGroupProps) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(true);
  const [editing, setEditing] = useState(false);
  const [newName, setNewName] = useState(name);

  const renameSubheading = useMutation({
    mutationFn: async () => {
      const trimmed = newName.trim();
      if (!trimmed || trimmed === name) return;
      // Update all resources with this subheading
      for (const id of resourceIds) {
        const { error } = await supabase
          .from("resources")
          .update({ subheading: trimmed } as any)
          .eq("id", id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Subheading renamed");
      queryClient.invalidateQueries({ queryKey: ["resources"] });
      setEditing(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteSubheading = useMutation({
    mutationFn: async () => {
      // Remove subheading from all resources (set to null)
      for (const id of resourceIds) {
        const { error } = await supabase
          .from("resources")
          .update({ subheading: null } as any)
          .eq("id", id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Subheading removed — resources moved to ungrouped");
      queryClient.invalidateQueries({ queryKey: ["resources"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="space-y-2">
      <div className="flex items-center gap-2 pt-2">
        <div className="h-px flex-1 bg-border" />
        {editing ? (
          <div className="flex items-center gap-1.5">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="h-7 text-xs w-40"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") renameSubheading.mutate();
                if (e.key === "Escape") { setEditing(false); setNewName(name); }
              }}
            />
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => renameSubheading.mutate()}
              disabled={!newName.trim() || renameSubheading.isPending}
            >
              <Check className="h-3 w-3 text-accent" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => { setEditing(false); setNewName(name); }}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        ) : (
          <CollapsibleTrigger asChild>
            <button className="flex items-center gap-1.5 shrink-0 group">
              <ChevronDown className={`h-3 w-3 text-muted-foreground transition-transform ${open ? "rotate-0" : "-rotate-90"}`} />
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider group-hover:text-foreground transition-colors">
                {name}
              </h4>
              <span className="text-[10px] text-muted-foreground/60">({resourceIds.length})</span>
            </button>
          </CollapsibleTrigger>
        )}
        {canManage && !editing && (
          <div className="flex items-center gap-0.5">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => { setEditing(true); setNewName(name); }}
              title="Rename subheading"
            >
              <Pencil className="h-3 w-3 text-muted-foreground" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => deleteSubheading.mutate()}
              title="Remove subheading (keeps resources)"
            >
              <Trash2 className="h-3 w-3 text-destructive" />
            </Button>
          </div>
        )}
        <div className="h-px flex-1 bg-border" />
      </div>
      <CollapsibleContent>
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}
