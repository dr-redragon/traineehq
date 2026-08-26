import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDeanery } from "@/contexts/DeaneryContext";
import type { FileWidgetSettings } from "./FileBrowserWidget";

const NONE = "__none__";

export function FileBrowserWidgetSettings({
  open,
  onOpenChange,
  value,
  onSave,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  value?: FileWidgetSettings;
  onSave: (v: FileWidgetSettings) => void;
}) {
  const { activeDeanery } = useDeanery();
  const [specialtyId, setSpecialtyId] = useState<string | null>(value?.specialtyId ?? null);
  const [subsectionId, setSubsectionId] = useState<string | null>(value?.subsectionId ?? null);
  const [folderId, setFolderId] = useState<string | null>(value?.folderId ?? null);

  useEffect(() => {
    if (open) {
      setSpecialtyId(value?.specialtyId ?? null);
      setSubsectionId(value?.subsectionId ?? null);
      setFolderId(value?.folderId ?? null);
    }
  }, [open, value?.specialtyId, value?.subsectionId, value?.folderId]);

  const { data: specialties } = useQuery({
    queryKey: ["fbw-cfg-specialties", activeDeanery?.id],
    queryFn: async () => {
      let q = supabase.from("specialties").select("id, short_name, name").eq("is_active", true).order("sort_order");
      if (activeDeanery) q = q.eq("deanery_id", activeDeanery.id);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
    enabled: open,
  });

  const { data: subsections } = useQuery({
    queryKey: ["fbw-cfg-subsections", specialtyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subsections").select("id, name").eq("specialty_id", specialtyId!).order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
    enabled: open && !!specialtyId,
  });

  const { data: folders } = useQuery({
    queryKey: ["fbw-cfg-folders", subsectionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("resource_folders").select("id, name").eq("subsection_id", subsectionId!).order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
    enabled: open && !!subsectionId,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Quick Files settings</DialogTitle>
          <DialogDescription>Choose the specialty, section and folder this widget opens on.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Specialty</Label>
            <Select
              value={specialtyId ?? NONE}
              onValueChange={(v) => {
                setSpecialtyId(v === NONE ? null : v);
                setSubsectionId(null);
                setFolderId(null);
              }}
            >
              <SelectTrigger><SelectValue placeholder="First available" /></SelectTrigger>
              <SelectContent className="bg-popover z-50">
                <SelectItem value={NONE}>First available</SelectItem>
                {specialties?.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.short_name || s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Section</Label>
            <Select
              value={subsectionId ?? NONE}
              onValueChange={(v) => { setSubsectionId(v === NONE ? null : v); setFolderId(null); }}
              disabled={!specialtyId}
            >
              <SelectTrigger><SelectValue placeholder="Show all sections" /></SelectTrigger>
              <SelectContent className="bg-popover z-50">
                <SelectItem value={NONE}>Show all sections</SelectItem>
                {subsections?.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Folder</Label>
            <Select
              value={folderId ?? NONE}
              onValueChange={(v) => setFolderId(v === NONE ? null : v)}
              disabled={!subsectionId}
            >
              <SelectTrigger><SelectValue placeholder="Section root" /></SelectTrigger>
              <SelectContent className="bg-popover z-50">
                <SelectItem value={NONE}>Section root</SelectItem>
                {folders?.map((f) => (
                  <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={() => { onSave({ specialtyId, subsectionId, folderId }); onOpenChange(false); }}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
