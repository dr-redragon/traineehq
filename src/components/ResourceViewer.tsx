import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExternalLink, Download, FileText, AlertTriangle, Loader2 } from "lucide-react";

import type { Tables } from "@/integrations/supabase/types";
import { toast } from "sonner";
import { downloadResourceFile } from "@/lib/resourceDownloads";
import { getSignedResourceUrl, extractStoragePath } from "@/lib/storageUtils";

interface ResourceViewerProps {
  resource: Tables<"resources"> | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function getViewerUrl(url: string): { url: string; type: "pdf" | "office" | "direct" } | null {
  if (!url) return null;
  const lowerUrl = url.toLowerCase().split("?")[0];

  if (lowerUrl.endsWith(".pdf")) {
    return { url, type: "pdf" };
  }

  if (
    lowerUrl.endsWith(".docx") || lowerUrl.endsWith(".doc") ||
    lowerUrl.endsWith(".pptx") || lowerUrl.endsWith(".ppt") ||
    lowerUrl.endsWith(".xlsx") || lowerUrl.endsWith(".xls")
  ) {
    return {
      url: `https://docs.google.com/gview?url=${encodeURIComponent(url)}&embedded=true`,
      type: "office",
    };
  }

  return { url, type: "direct" };
}

function isVideo(resource: Tables<"resources">): boolean {
  if (resource.resource_type === "video") return true;
  const url = resource.file_url || resource.external_url || "";
  return /\.(mp4|webm|ogg)$/i.test(url);
}

function isYouTube(resource: Tables<"resources">): string | null {
  const url = resource.external_url || resource.embed_url || "";
  const match = url.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/
  );
  return match ? match[1] : null;
}

export function ResourceViewer({ resource, open, onOpenChange }: ResourceViewerProps) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!open || !resource?.file_url) {
      setSignedUrl(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    getSignedResourceUrl(resource.file_url).then((url) => {
      if (!cancelled) {
        setSignedUrl(url);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [open, resource?.file_url]);

  if (!resource) return null;

  const isStorageFile = resource.file_url && extractStoragePath(resource.file_url) !== null;
  const resolvedFileUrl = isStorageFile ? signedUrl : resource.file_url;
  const rawUrl = resolvedFileUrl || resource.external_url || resource.embed_url;
  const canDownload = Boolean(resource.file_url || resource.external_url);
  const viewerUrl = rawUrl ? getViewerUrl(rawUrl) : null;
  const ytId = isYouTube(resource);
  const video = isVideo(resource);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const fileName = await downloadResourceFile(resource);
      toast.success(`${fileName} downloaded`);
    } catch (error: any) {
      toast.error(error.message || "Unable to download this file");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl w-[95vw] h-[85vh] flex flex-col p-0 gap-0">
        <span className="sr-only">
          <DialogTitle>{resource.title}</DialogTitle>
          <DialogDescription>Viewing resource: {resource.title}</DialogDescription>
        </span>

        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b bg-secondary/30 pr-12">
          <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold truncate">{resource.title}</h3>
            {resource.description && (
              <p className="text-xs text-muted-foreground truncate">{resource.description}</p>
            )}
          </div>
          <Badge variant="secondary" className="text-[10px] shrink-0">
            {resource.resource_type.toUpperCase()}
          </Badge>
          {rawUrl && (
            <a
              href={rawUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1 rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent hover:text-accent-foreground transition-colors"
            >
              <ExternalLink className="h-3 w-3" /> Open
            </a>
          )}
          {canDownload && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1 text-xs"
              disabled={downloading}
              onClick={(e) => {
                e.stopPropagation();
                handleDownload();
              }}
            >
              {downloading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
              {downloading ? "Downloading…" : "Download"}
            </Button>
          )}
        </div>

        {/* Content area */}
        <div className="flex-1 overflow-hidden bg-muted/20">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : ytId ? (
            <iframe
              src={`https://www.youtube.com/embed/${ytId}?autoplay=0`}
              className="w-full h-full border-0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              title={resource.title}
            />
          ) : video && rawUrl ? (
            <div className="flex items-center justify-center h-full p-4">
              <video controls className="max-w-full max-h-full rounded-lg shadow-lg" src={rawUrl}>
                Your browser does not support the video tag.
              </video>
            </div>
          ) : viewerUrl ? (
            viewerUrl.type === "pdf" ? (
              <object
                data={viewerUrl.url}
                type="application/pdf"
                className="w-full h-full"
              >
                <iframe
                  src={`https://docs.google.com/gview?url=${encodeURIComponent(viewerUrl.url)}&embedded=true`}
                  className="w-full h-full border-0"
                  title={resource.title}
                />
              </object>
            ) : (
              <iframe
                src={viewerUrl.url}
                className="w-full h-full border-0"
                title={resource.title}
              />
            )
          ) : (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
              <AlertTriangle className="h-10 w-10 opacity-40" />
              <p className="text-sm">No viewable content available for this resource.</p>
              {rawUrl && (
                <a
                  href={rawUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  className="inline-flex items-center gap-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors"
                >
                  Open in new tab <ExternalLink className="h-3 w-3 ml-1" />
                </a>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
