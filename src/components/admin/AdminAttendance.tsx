import { Button } from "@/components/ui/button";
import { ExternalLink } from "lucide-react";

export function AdminAttendance() {
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button asChild variant="outline" size="sm">
          <a href="/teaching-register.html" target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-4 w-4 mr-2" /> Open in new tab
          </a>
        </Button>
      </div>
      <div className="w-full overflow-hidden rounded-lg border bg-background">
        <iframe
          src="/teaching-register.html"
          title="ENT Teaching Register"
          className="w-full"
          allow="clipboard-read; clipboard-write; downloads"
          sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads allow-forms allow-top-navigation-by-user-activation"
          style={{ height: "calc(100vh - 220px)", minHeight: "700px", border: 0 }}
        />
      </div>
    </div>
  );
}
