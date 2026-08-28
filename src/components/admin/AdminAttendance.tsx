import { Button } from "@/components/ui/button";
import { ExternalLink } from "lucide-react";

/**
 * The ENT teaching register, embedded from its own deployment.
 *
 * It lives in dr-redragon/ent-teaching-register and publishes to this domain from
 * that repository, so it is framed rather than copied in — a copy here would be a
 * fork that silently drifts from the version trainees actually check in against.
 *
 * It is a self-contained app with its own Supabase project and its own organiser
 * sign-in, so the first thing it shows inside the frame is its own login — a
 * TraineeHQ session does not carry over to it.
 */
const REGISTER_URL = "https://register.traineehq.com/";

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
          // allow-same-origin keeps the frame on its own origin, which it needs for
          // its Supabase session; being cross-origin, it still cannot reach into
          // this app. No allow-top-navigation: the register has no reason to
          // navigate the surrounding app away from the admin panel.
          sandbox="allow-scripts allow-same-origin allow-popups allow-modals allow-downloads allow-forms"
          style={{ height: "calc(100vh - 220px)", minHeight: "700px", border: 0 }}
        />
      </div>
    </div>
  );
}
