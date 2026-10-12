import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { History } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { fetchRegisterHistory, restoreRegisterVersion, type RegisterVersion } from "@/lib/register/api";
import type { RegisterDirectoryEntry } from "@/lib/register/types";

const when = (value: string | null) =>
  value ? new Date(value).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : "—";

/**
 * Earlier versions of the register's data, for its owners.
 *
 * Every organiser save keeps the version it replaced (the latest 100), so a
 * mistaken bulk delete — or a deliberate one — can be rolled back. Restoring is
 * itself a save, so it can be undone the same way.
 */
export function RegisterHistoryPanel({ register }: { register: RegisterDirectoryEntry }) {
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState<RegisterVersion | null>(null);

  const { data: versions, isLoading } = useQuery({
    queryKey: ["register-history", register.id],
    queryFn: () => fetchRegisterHistory(register.id),
  });

  const restore = useMutation({
    mutationFn: (version: number) => restoreRegisterVersion(register.id, version),
    onSuccess: () => {
      toast.success("Earlier version restored. The version it replaced is in the history.");
      queryClient.invalidateQueries({ queryKey: ["register-history", register.id] });
      queryClient.invalidateQueries({ queryKey: ["register-store", register.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <History className="h-4 w-4" /> Earlier versions
      </h2>
      <p className="max-w-2xl text-sm text-muted-foreground">
        Each save keeps the version it replaced. If trainees, teaching days or attendance
        disappear, restore the last version that still had them.
      </p>
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <p className="p-4 text-sm text-muted-foreground">Loading…</p>
          ) : !versions?.length ? (
            <p className="p-4 text-sm text-muted-foreground">No earlier versions yet.</p>
          ) : (
            <ul className="divide-y">
              {versions.slice(0, 20).map((v) => (
                <li key={v.version} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
                  <span>
                    <span className="font-medium">Version {v.version}</span>
                    <span className="text-muted-foreground"> · replaced {when(v.replaced_at)}</span>
                    <span className="block text-xs text-muted-foreground">
                      {v.counts.trainees} trainees · {v.counts.sessions} teaching days · {v.counts.attendance} attendance marks
                    </span>
                  </span>
                  <Button size="sm" variant="outline" disabled={restore.isPending} onClick={() => setConfirming(v)}>
                    Restore
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!confirming} onOpenChange={(open) => !open && setConfirming(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore version {confirming?.version}?</AlertDialogTitle>
            <AlertDialogDescription>
              The register goes back to {confirming?.counts.trainees} trainees and{" "}
              {confirming?.counts.sessions} teaching days. Anything saved since is kept in the
              history, so this can be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirming && restore.mutate(confirming.version)}>
              Restore
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
