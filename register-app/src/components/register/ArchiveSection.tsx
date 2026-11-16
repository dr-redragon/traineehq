import { useState } from "react";
import { RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useDeleteRegisterForever, useRegisterArchive, useRestoreRegister } from "@/hooks/useRegisters";
import { archivedAgo, daysUntilPurge, purgeCountdown } from "@/lib/register/archive";
import type { ArchivedRegister } from "@/lib/register/types";

/**
 * Registers this person has deleted, and the clock they are running against.
 * Shown only when there is something in it. It lives on the register list
 * because a deleted register has no page left to visit.
 */
export function ArchiveSection() {
  const { data: archived } = useRegisterArchive();
  const restore = useRestoreRegister();
  const destroy = useDeleteRegisterForever();
  const [destroying, setDestroying] = useState<ArchivedRegister | null>(null);

  if (!archived?.length) return null;

  const restoreOne = (entry: ArchivedRegister) =>
    restore.mutate(entry.id, {
      onSuccess: () => toast.success(`${entry.name} is back.`),
      onError: (e: Error) => toast.error(e.message),
    });

  const destroyOne = (entry: ArchivedRegister) =>
    destroy.mutate(entry.id, {
      onSuccess: () => {
        setDestroying(null);
        toast.success(`${entry.name} has been deleted permanently.`);
      },
      onError: (e: Error) => toast.error(e.message),
    });

  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold">Archive</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {archived.map((entry) => (
          <Card key={entry.id} className="border-dashed">
            <CardContent className="space-y-3 p-4">
              <div className="min-w-0">
                <p className="truncate font-medium">{entry.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {entry.kind === "event" ? "Event" : "Regular"} · {plural(entry.trainee_count, "person", "people")} ·{" "}
                  {plural(entry.session_count, "day", "days")}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <Badge variant={daysUntilPurge(entry.purge_at) <= 3 ? "destructive" : "secondary"}>
                  {purgeCountdown(entry.purge_at)}
                </Badge>
                <span className="text-muted-foreground">Deleted {archivedAgo(entry.archived_at)}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => restoreOne(entry)} disabled={restore.isPending}>
                  <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Restore
                </Button>
                <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive"
                  onClick={() => setDestroying(entry)}>
                  <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Delete permanently
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        A deleted register waits here for 15 days. Restoring brings it back whole — people,
        days, attendance and feedback — for every member who had it. When the time
        runs out it is deleted permanently on its own.
      </p>

      <AlertDialog open={!!destroying} onOpenChange={(open) => !open && setDestroying(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {destroying?.name} permanently?</AlertDialogTitle>
            <AlertDialogDescription>
              Its people and days — with every attendance mark, feedback response and
              certificate record — are destroyed now. There is no undo. Left alone, it would be
              deleted on its own in {destroying ? purgeCountdown(destroying.purge_at).toLowerCase() : ""}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it in the archive</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={destroy.isPending}
              onClick={(e) => { e.preventDefault(); if (destroying) destroyOne(destroying); }}
            >
              {destroy.isPending ? "Deleting…" : "Delete permanently"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
