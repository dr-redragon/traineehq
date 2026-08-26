import { useMemo, useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useDeanery } from "@/contexts/DeaneryContext";
import {
  ArrowLeft, ChevronRight, File, FileText, Folder, HardDrive, Link as LinkIcon, Settings2, Video,
} from "lucide-react";

export interface FileWidgetSettings {
  specialtyId?: string | null;
  subsectionId?: string | null;
  folderId?: string | null;
}

function typeIcon(type: string) {
  if (type === "video") return Video;
  if (type === "link") return LinkIcon;
  if (type === "document") return FileText;
  return File;
}

export function FileBrowserWidget({
  settings,
  onOpenSettings,
}: {
  settings?: FileWidgetSettings;
  onOpenSettings?: () => void;
}) {
  const { activeDeanery } = useDeanery();

  const { data: specialties } = useQuery({
    queryKey: ["fbw-specialties", activeDeanery?.id],
    queryFn: async () => {
      let q = supabase.from("specialties").select("id, name, short_name").eq("is_active", true).order("sort_order");
      if (activeDeanery) q = q.eq("deanery_id", activeDeanery.id);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!activeDeanery,
  });

  const defaultSpecialty = settings?.specialtyId ?? null;
  const [specialtyId, setSpecialtyId] = useState<string | null>(defaultSpecialty);
  const [subsectionId, setSubsectionId] = useState<string | null>(settings?.subsectionId ?? null);
  const [folderId, setFolderId] = useState<string | null>(settings?.folderId ?? null);

  useEffect(() => {
    setSpecialtyId(settings?.specialtyId ?? null);
    setSubsectionId(settings?.subsectionId ?? null);
    setFolderId(settings?.folderId ?? null);
  }, [settings?.specialtyId, settings?.subsectionId, settings?.folderId]);

  const effectiveSpecialty = specialtyId ?? specialties?.[0]?.id ?? null;

  const { data: subsections } = useQuery({
    queryKey: ["fbw-subsections", effectiveSpecialty],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subsections").select("id, name").eq("specialty_id", effectiveSpecialty!).order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!effectiveSpecialty,
  });

  const { data: folders } = useQuery({
    queryKey: ["fbw-folders", subsectionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("resource_folders").select("id, name").eq("subsection_id", subsectionId!).order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!subsectionId,
  });

  const { data: resources } = useQuery({
    queryKey: ["fbw-resources", subsectionId, folderId],
    queryFn: async () => {
      let q = supabase
        .from("resources").select("id, title, resource_type, folder_id")
        .eq("subsection_id", subsectionId!).order("sort_order").limit(50);
      q = folderId ? q.eq("folder_id", folderId) : q.is("folder_id", null);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!subsectionId,
  });

  const specialtyName = useMemo(
    () => specialties?.find((s) => s.id === effectiveSpecialty)?.short_name ?? "Files",
    [specialties, effectiveSpecialty]
  );
  const subsectionName = subsections?.find((s) => s.id === subsectionId)?.name;
  const folderName = folders?.find((f) => f.id === folderId)?.name;

  const goBack = () => {
    if (folderId) setFolderId(null);
    else if (subsectionId) setSubsectionId(null);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <HardDrive className="h-4 w-4 text-primary" />
          Quick Files
          <div className="ml-auto flex items-center gap-1">
            {effectiveSpecialty && (
              <Link
                to={`/specialty/${effectiveSpecialty}`}
                className="text-xs font-normal text-muted-foreground hover:text-primary"
              >
                Open full view
              </Link>
            )}
            {onOpenSettings && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-muted-foreground hover:text-primary"
                onClick={onOpenSettings}
                aria-label="Quick Files settings"
                title="Quick Files settings"
              >
                <Settings2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {/* Breadcrumb */}
        <div className="flex items-center gap-1 text-xs text-muted-foreground flex-wrap">
          {(subsectionId || folderId) && (
            <Button variant="ghost" size="sm" className="h-6 px-1.5 gap-1 text-xs" onClick={goBack}>
              <ArrowLeft className="h-3 w-3" /> Back
            </Button>
          )}
          <span className="font-medium text-foreground">{specialtyName}</span>
          {subsectionName && (<><ChevronRight className="h-3 w-3" /><span>{subsectionName}</span></>)}
          {folderName && (<><ChevronRight className="h-3 w-3" /><span>{folderName}</span></>)}
        </div>

        {!effectiveSpecialty ? (
          <p className="text-sm text-muted-foreground py-4 text-center">No specialties available.</p>
        ) : !subsectionId ? (
          <div className="space-y-1">
            {subsections?.length ? subsections.map((s) => (
              <button
                key={s.id}
                onClick={() => { setSubsectionId(s.id); setFolderId(null); }}
                className="w-full flex items-center gap-3 p-2 rounded-md hover:bg-secondary/50 transition-colors text-left"
              >
                <Folder className="h-4 w-4 text-primary shrink-0" />
                <span className="text-sm truncate flex-1">{s.name}</span>
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            )) : <p className="text-sm text-muted-foreground py-4 text-center">No sections yet.</p>}
          </div>
        ) : (
          <div className="space-y-1">
            {!folderId && folders?.map((f) => (
              <button
                key={f.id}
                onClick={() => setFolderId(f.id)}
                className="w-full flex items-center gap-3 p-2 rounded-md hover:bg-secondary/50 transition-colors text-left"
              >
                <Folder className="h-4 w-4 text-primary shrink-0" />
                <span className="text-sm truncate flex-1">{f.name}</span>
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            ))}
            {resources?.map((r) => {
              const Icon = typeIcon(r.resource_type as string);
              return (
                <Link
                  key={r.id}
                  to={`/specialty/${effectiveSpecialty}`}
                  className="flex items-center gap-3 p-2 rounded-md hover:bg-secondary/50 transition-colors group"
                >
                  <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-sm truncate flex-1 group-hover:text-primary transition-colors">{r.title}</span>
                  <Badge variant="outline" className="text-[9px] shrink-0">{r.resource_type}</Badge>
                </Link>
              );
            })}
            {!folders?.length && !resources?.length && (
              <p className="text-sm text-muted-foreground py-4 text-center">This section is empty.</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
