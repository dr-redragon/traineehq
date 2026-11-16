import { Link } from "react-router-dom";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Shown over a regular register none of whose owners is subscribed.
 *
 * It says what still works, because the fear on seeing this is that the
 * attendance has gone. It has not: reading, exporting and deleting all still
 * work, and writing comes back the moment an owner subscribes.
 */
export function ReadOnlyNotice({ isOwner }: { isOwner: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-3 border-l-4 border-rule bg-card p-4 print:hidden">
      <Lock className="h-5 w-5 shrink-0 text-accent-deep" />
      <div className="min-w-[220px] flex-1">
        <p className="text-sm font-bold">This register is read-only</p>
        <p className="text-sm text-muted-foreground">
          {isOwner
            ? "Regular registers need a subscription. Nothing has been deleted — you can still read, print and export everything, and editing comes back as soon as you subscribe."
            : "Its owner's subscription has ended. Nothing has been deleted — you can still read everything, and editing comes back when an owner subscribes."}
        </p>
      </div>
      {isOwner && (
        <Button asChild size="sm">
          <Link to="/account">Subscribe</Link>
        </Button>
      )}
    </div>
  );
}
