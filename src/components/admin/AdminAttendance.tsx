import { Button } from "@/components/ui/button";
import { ExternalLink } from "lucide-react";

/**
 * The ENT teaching register, transferred from the dr-redragon/ent-teaching-register
 * repository and served from /public/teaching-register/.
 *
 * It is a self-contained app with its own Supabase project and its own organiser
 * sign-in, so the first thing it shows inside the frame is its own login — a
 * TraineeHQ session does not carry over to it.
 */
const REGISTER_URL = "/teaching-register/";

export function AdminAttendance() {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          The teaching register signs in separately from TraineeHQ.
        </p>
        <Button asChild variant="outline" size="sm">
          <a href={REGISTER_URL} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-4 w-4 mr-2" /> Open in new tab
          </a>
        </Button>
      </div>
      <div className="w-full overflow-hidden rounded-lg border bg-background">
        <iframe
          src={REGISTER_URL}
          title="ENT Teaching Register"
          className="w-full"
          allow="clipboard-read; clipboard-write; downloads"
          // No allow-top-navigation: the register has no reason to navigate the
          // surrounding app away from the admin panel.
          sandbox="allow-scripts allow-same-origin allow-popups allow-modals allow-downloads allow-forms"
          style={{ height: "calc(100vh - 220px)", minHeight: "700px", border: 0 }}
        />
      </div>
    </div>
  );
}
