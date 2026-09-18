import { useMemo, useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { WidgetSection } from "@/components/dashboard/WidgetSection";
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
      let q = supabase.from("specialties").select("id, name, short_name").eq("is_active", true).is("deleted_at", null).order("sort_order");
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
    <WidgetSection
      icon={HardDrive}
      title="Quick Files"
      action={
        <div className="flex items-center gap-2">
          {effectiveSpecialty && (
            <Link
              to={`/specialty/${effectiveSpecialty}`}
              className="text-xs text-accent-700 underline underline-offset-[3px] hover:text-accent-800"
            >
              Open full view
            </Link>
          )}
          {onOpenSettings && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={onOpenSettings}
              aria-label="Quick Files settings"
              title="Quick Files settings"
            >
              <Settings2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      }
    >
      <div className="space-y-2">
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
          <p className="py-3 text-[13px] text-muted-foreground">No specialties available.</p>
        ) : !subsectionId ? (
          <div className="space-y-1">
            {subsections?.length ? subsections.map((s) => (
              <button
                key={s.id}
                onClick={() => { setSubsectionId(s.id); setFolderId(null); }}
                className="w-full flex items-center gap-3 p-2 rounded-md hover:bg-secondary/50 transition-colors text-left"
              >
                <Folder className="h-4 w-4 text-rule shrink-0" />
                <span className="text-sm truncate flex-1">{s.name}</span>
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            )) : <p className="py-3 text-[13px] text-muted-foreground">No sections yet.</p>}
          </div>
        ) : (
          <div className="space-y-1">
            {!folderId && folders?.map((f) => (
              <button
                key={f.id}
                onClick={() => setFolderId(f.id)}
                className="w-full flex items-center gap-3 p-2 rounded-md hover:bg-secondary/50 transition-colors text-left"
              >
                <Folder className="h-4 w-4 text-rule shrink-0" />
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
                  className="group flex items-center gap-3 px-1 py-2 transition-colors hover:bg-foreground/[0.04]"
                >
                  <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-sm truncate flex-1 transition-colors group-hover:text-rule">{r.title}</span>
                  <Badge variant="outline" className="text-[9px] shrink-0">{r.resource_type}</Badge>
                </Link>
              );
            })}
            {!folders?.length && !resources?.length && (
              <p className="py-3 text-[13px] text-muted-foreground">This section is empty.</p>
            )}
          </div>
        )}
      </div>
    </WidgetSection>
  );
}
