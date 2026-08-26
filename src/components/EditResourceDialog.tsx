import { useState, useRef, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, FileUp } from "lucide-react";
import { toast } from "sonner";
import { FileDropOverlay } from "@/components/FileDropOverlay";
import { Constants } from "@/integrations/supabase/types";
import type { Tables } from "@/integrations/supabase/types";

interface EditResourceDialogProps {
  resource: Tables<"resources">;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingSubheadings?: string[];
}

export function EditResourceDialog({ resource, open, onOpenChange, existingSubheadings = [] }: EditResourceDialogProps) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState(resource.title);
  const [description, setDescription] = useState(resource.description ?? "");
  const [resourceType, setResourceType] = useState(resource.resource_type);
  const [externalUrl, setExternalUrl] = useState(resource.external_url ?? "");
  const [subheading, setSubheading] = useState((resource as any).subheading ?? "none");
  const [customSubheading, setCustomSubheading] = useState("");
  const [subsectionId, setSubsectionId] = useState(resource.subsection_id);
  const [file, setFile] = useState<File | null>(null);
  const [removeFile, setRemoveFile] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [dragItemCount, setDragItemCount] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  // Fetch sibling subsections for the same specialty
  const { data: siblingSubsections } = useQuery({
    queryKey: ["sibling-subsections", resource.subsection_id],
    queryFn: async () => {
      // First get the specialty_id from the current subsection
      const { data: currentSub } = await supabase
        .from("subsections")
        .select("specialty_id")
        .eq("id", resource.subsection_id)
        .single();
      if (!currentSub) return [];
      // Then fetch all subsections for that specialty
      const { data } = await supabase
        .from("subsections")
        .select("id, name")
        .eq("specialty_id", currentSub.specialty_id)
        .order("sort_order", { ascending: true });
      return data ?? [];
    },
    enabled: open,
  });

  useEffect(() => {
    if (open) {
      setTitle(resource.title);
      setDescription(resource.description ?? "");
      setResourceType(resource.resource_type);
      setExternalUrl(resource.external_url ?? "");
      setSubheading((resource as any).subheading ?? "none");
      setCustomSubheading("");
      setSubsectionId(resource.subsection_id);
      setFile(null);
      setRemoveFile(false);
    }
  }, [open, resource]);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) {
      setFile(f);
      setRemoveFile(false);
      if (f.type === "application/pdf") setResourceType("pdf");
      else if (f.type.startsWith("video/")) setResourceType("video");
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      setFile(f);
      setRemoveFile(false);
      if (f.type === "application/pdf") setResourceType("pdf");
      else if (f.type.startsWith("video/")) setResourceType("video");
    }
  };

  const updateResource = useMutation({
    mutationFn: async () => {
      setSaving(true);
      let fileUrl = resource.file_url;

      if (file) {
        const ext = file.name.split(".").pop();
        const path = `${subsectionId}/${crypto.randomUUID()}.${ext}`;
        const { error: uploadErr } = await supabase.storage.from("resources").upload(path, file);
        if (uploadErr) throw uploadErr;
        fileUrl = path;
      } else if (removeFile) {
        fileUrl = null;
      }

      const finalSubheading = subheading === "__new__" ? customSubheading.trim() : (subheading === "none" ? null : subheading);

      const { error } = await supabase.from("resources").update({
        title: title.trim(),
        description: description.trim() || null,
        resource_type: resourceType as any,
        external_url: externalUrl.trim() || null,
        file_url: fileUrl,
        subheading: finalSubheading,
        subsection_id: subsectionId,
      } as any).eq("id", resource.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Resource updated");
      queryClient.invalidateQueries({ queryKey: ["resources"] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
    onSettled: () => setSaving(false),
  });

  const currentFile = file ? file.name : (!removeFile && resource.file_url) ? resource.file_url.split("/").pop() : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Edit Resource</DialogTitle></DialogHeader>
        <div className="space-y-4 pt-2">
          {/* File upload / replace zone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              if (!dragOver) {
                setDragOver(true);
                setDragItemCount(e.dataTransfer.items?.length ?? 0);
              }
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                setDragOver(false);
                setDragItemCount(0);
              }
            }}
            onDrop={(e) => { setDragItemCount(0); handleDrop(e); }}
            onClick={() => fileRef.current?.click()}
            className={`relative border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
              dragOver ? "border-accent bg-accent/5" : currentFile ? "border-accent/40 bg-accent/5" : "border-border hover:border-accent/40"
            }`}
          >
            <input ref={fileRef} type="file" className="hidden" onChange={handleFileChange} />
            {currentFile ? (
              <div className="flex items-center justify-center gap-2">
                <FileUp className="h-4 w-4 text-accent" />
                <span className="text-sm font-medium truncate max-w-[200px]">{currentFile}</span>
                <button
                  className="text-xs text-destructive hover:underline"
                  onClick={(e) => { e.stopPropagation(); setFile(null); setRemoveFile(true); }}
                >
                  Remove
                </button>
              </div>
            ) : (
              <>
                <Upload className="h-6 w-6 text-muted-foreground/40 mx-auto mb-1" />
                <p className="text-sm text-muted-foreground">Drop a new file or click to replace</p>
              </>
            )}
            <FileDropOverlay active={dragOver} itemCount={dragItemCount} compact label="Drop to replace" />
          </div>


          <div className="space-y-1.5">
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Description (optional)</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={resourceType} onValueChange={(v) => setResourceType(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Constants.public.Enums.resource_type.map((t) => (
                    <SelectItem key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>External URL (optional)</Label>
              <Input value={externalUrl} onChange={(e) => setExternalUrl(e.target.value)} placeholder="https://…" />
            </div>
          </div>

          {/* Move to section */}
          {(siblingSubsections?.length ?? 0) > 1 && (
            <div className="space-y-1.5">
              <Label>Section</Label>
              <Select value={subsectionId} onValueChange={setSubsectionId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {siblingSubsections!.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Subheading (optional)</Label>
            <Select value={subheading} onValueChange={setSubheading}>
              <SelectTrigger><SelectValue placeholder="No subheading" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No subheading</SelectItem>
                {existingSubheadings.map((sh) => (
                  <SelectItem key={sh} value={sh}>{sh}</SelectItem>
                ))}
                <SelectItem value="__new__">+ Create new subheading</SelectItem>
              </SelectContent>
            </Select>
            {subheading === "__new__" && (
              <Input
                value={customSubheading}
                onChange={(e) => setCustomSubheading(e.target.value)}
                placeholder="Enter new subheading name…"
                className="mt-1.5"
              />
            )}
          </div>
          <Button
            className="w-full"
            onClick={() => updateResource.mutate()}
            disabled={!title.trim() || saving}
          >
            {saving ? "Saving…" : "Save Changes"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
