import { Button } from "@/components/ui/button";
import { Trash2, Download, X, CheckSquare } from "lucide-react";

interface BulkActionBarProps {
  selectedCount: number;
  onDelete: () => void;
  onDownload: () => void;
  onClear: () => void;
  deleting?: boolean;
  downloading?: boolean;
}

export function BulkActionBar({
  selectedCount,
  onDelete,
  onDownload,
  onClear,
  deleting,
  downloading,
}: BulkActionBarProps) {
  if (selectedCount === 0) return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-fade-in">
      <div className="flex items-center gap-3 bg-card border shadow-lg rounded-xl px-4 py-2.5">
        <div className="flex items-center gap-2 text-sm font-medium">
          <CheckSquare className="h-4 w-4 text-accent" />
          <span>{selectedCount} selected</span>
        </div>
        <div className="h-5 w-px bg-border" />
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 text-xs"
          onClick={onDownload}
          disabled={downloading}
        >
          <Download className="h-3.5 w-3.5" />
          {downloading ? "Downloading…" : "Download"}
        </Button>
        <Button
          variant="destructive"
          size="sm"
          className="gap-1.5 text-xs"
          onClick={onDelete}
          disabled={deleting}
        >
          <Trash2 className="h-3.5 w-3.5" />
          {deleting ? "Deleting…" : "Delete"}
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClear}>
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
