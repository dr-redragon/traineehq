import { Progress } from "@/components/ui/progress";
import { Upload } from "lucide-react";

interface UploadProgressBarProps {
  current: number;
  total: number;
  currentFileName?: string;
}

export function UploadProgressBar({ current, total, currentFileName }: UploadProgressBarProps) {
  if (total === 0) return null;
  const pct = Math.round((current / total) * 100);

  return (
    <div className="space-y-1.5 py-2">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Upload className="h-3 w-3 animate-pulse" />
          Uploading {current} of {total}
        </span>
        <span>{pct}%</span>
      </div>
      <Progress value={pct} className="h-2" />
      {currentFileName && (
        <p className="text-xs text-muted-foreground truncate">{currentFileName}</p>
      )}
    </div>
  );
}
