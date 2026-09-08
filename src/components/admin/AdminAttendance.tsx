import { Link } from "react-router-dom";
import { ArrowRight, ClipboardCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useGroupedRegisters } from "@/hooks/useRegisters";

/**
 * A pointer to the teaching registers, not the registers themselves.
 *
 * This used to be an iframe of register.traineehq.com, with a comment arguing
 * that copying the register in "would be a fork that silently drifts from the
 * version trainees actually check in against". That was right about the ENT
 * register and wrong about this: the registers now live in this application, one
 * per specialty per deanery, against this database. There is nothing to drift
 * from.
 *
 * It stays a link rather than becoming the register inline, because access to a
 * register is a per-person grant that has nothing to do with holding an admin
 * role. An admin with no membership would get an empty screen here; sending them
 * to /registers gets them the directory, where they can ask for access.
 */
export function AdminAttendance() {
  const { grouped, isLoading } = useGroupedRegisters();
  const mine = grouped.mine;

  return (
    <Card>
      <CardContent className="space-y-4 p-6">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
            <ClipboardCheck className="h-5 w-5 text-primary" />
          </div>
          <div className="space-y-1">
            <h3 className="font-display font-semibold">Teaching registers</h3>
            <p className="text-sm text-muted-foreground">
              Attendance, teaching days, QR sign-in, excusals and reports — one register for
              each specialty in each deanery.
            </p>
          </div>
        </div>

        <div className="rounded-lg border bg-muted/30 p-3 text-sm">
          {isLoading ? (
            <span className="text-muted-foreground">Checking your access…</span>
          ) : mine.length === 0 ? (
            <span className="text-muted-foreground">
              You do not belong to a register yet. Being an administrator does not grant
              access to one — ask a member, or start your own from the directory.
            </span>
          ) : (
            <>
              <span className="text-muted-foreground">You have access to </span>
              <span className="font-medium">
                {mine.map((r) => `${r.deanery_name} · ${r.specialty_name}`).join(", ")}
              </span>
            </>
          )}
        </div>

        <Button asChild size="sm">
          <Link to="/registers">
            {mine.length === 0 ? "Browse the registers" : "Open the registers"}
            <ArrowRight className="ml-1.5 h-4 w-4" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
