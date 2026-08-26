import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FolderPlus } from "lucide-react";
import { toast } from "sonner";

interface AddFolderDialogProps {
  subsectionId: string;
  subheading?: string | null;
}

export function AddFolderDialog({ subsectionId, subheading }: AddFolderDialogProps) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  const addFolder = useMutation({
    mutationFn: async () => {
      const { data: existing } = await supabase
        .from("resource_folders")
        .select("sort_order")
        .eq("subsection_id", subsectionId)
        .order("sort_order", { ascending: false })
        .limit(1);
      const nextOrder = ((existing as any)?.[0]?.sort_order ?? -1) + 1;

      const { error } = await supabase.from("resource_folders").insert({
        name: name.trim(),
        subsection_id: subsectionId,
        subheading: subheading || null,
        sort_order: nextOrder,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Folder created");
      queryClient.invalidateQueries({ queryKey: ["resource-folders"] });
      setOpen(false);
      setName("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="text-xs gap-1.5">
          <FolderPlus className="h-3.5 w-3.5" /> Folder
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Create Folder</DialogTitle></DialogHeader>
        <div className="space-y-3 pt-2">
          <div className="space-y-1.5">
            <Label>Folder Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Lecture Slides"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && name.trim()) addFolder.mutate();
              }}
            />
          </div>
          <Button
            className="w-full"
            disabled={!name.trim() || addFolder.isPending}
            onClick={() => addFolder.mutate()}
          >
            {addFolder.isPending ? "Creating…" : "Create Folder"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
