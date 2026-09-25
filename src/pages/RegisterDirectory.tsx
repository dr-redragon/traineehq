import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Clock, Plus, RotateCcw, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  useCreatableDeaneries, useCreatableSpecialties, useCreateRegister,
  useDeleteRegisterForever, useGroupedRegisters, useRegisterArchive,
  useRequestRegisterAccess, useRestoreRegister,
} from "@/hooks/useRegisters";
import { useRegister } from "@/contexts/RegisterContext";
import { useUserRole } from "@/hooks/useUserRole";
import { archivedAgo, daysUntilPurge, purgeCountdown } from "@/lib/register/archive";
import type { ArchivedRegister, RegisterDirectoryEntry } from "@/lib/register/types";

function MemberCount({ n }: { n: number }) {
  return (
    <span className="flex items-center gap-1 text-xs text-muted-foreground">
      <Users className="h-3.5 w-3.5" />
      {n} {n === 1 ? "member" : "members"}
    </span>
  );
}

function RegisterName({ entry }: { entry: RegisterDirectoryEntry }) {
  return (
    <div className="min-w-0">
      <p className="truncate font-medium">{entry.specialty_name}</p>
      <p className="truncate text-xs text-muted-foreground">{entry.deanery_name}</p>
    </div>
  );
}

/**
 * Registers this person has deleted, and the clock they are running against.
 *
 * Shown only when there is something in it. It lives here rather than inside
 * a register because a deleted register has no page left to visit — and
 * because this is where somebody comes when the specialty they want to start
 * is mysteriously unavailable.
 */
function ArchiveSection() {
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
                <p className="truncate font-medium">{entry.specialty_name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {entry.deanery_name} · {plural(entry.trainee_count, "trainee", "trainees")} ·{" "}
                  {plural(entry.session_count, "teaching day", "teaching days")}
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
        A deleted register waits here for 15 days. Restoring brings it back whole — trainees,
        teaching days, attendance and feedback — for every member who had it. When the time
        runs out it is deleted permanently on its own.
      </p>

      <AlertDialog open={!!destroying} onOpenChange={(open) => !open && setDestroying(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {destroying?.name} permanently?</AlertDialogTitle>
            <AlertDialogDescription>
              Its trainees and teaching days — with every attendance mark, feedback response and
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

export default function RegisterDirectory() {
  const { grouped, isLoading } = useGroupedRegisters();
  const { setActiveRegisterSlug } = useRegister();
  const { data: role } = useUserRole();

  const [requesting, setRequesting] = useState<RegisterDirectoryEntry | null>(null);
  const [reason, setReason] = useState("");
  const [creating, setCreating] = useState(false);
  const [deaneryId, setDeaneryId] = useState("");
  const [specialtyId, setSpecialtyId] = useState("");

  const requestAccess = useRequestRegisterAccess();
  const createRegister = useCreateRegister();
  const { data: deaneries } = useCreatableDeaneries(creating);
  const { data: creatable } = useCreatableSpecialties(deaneryId || undefined);

  // Mirrors can_create_register() in the database: a TraineeHQ admin, or anyone
  // who already holds a register. The server is the authority — this only keeps
  // the button off the screen for people the RPC would refuse.
  const canCreate =
    role === "admin" || role === "super_admin" || grouped.mine.length > 0;

  const submitRequest = () => {
    if (!requesting) return;
    requestAccess.mutate(
      { registerId: requesting.id, reason },
      {
        onSuccess: () => {
          toast.success(`Access requested for ${requesting.specialty_name}.`);
          setRequesting(null);
          setReason("");
        },
        onError: (e: Error) => toast.error(e.message),
      },
    );
  };

  const submitCreate = () => {
    if (!deaneryId || !specialtyId) return;
    createRegister.mutate(
      { deaneryId, specialtyId },
      {
        onSuccess: () => {
          toast.success("Register created. You are its owner.");
          setCreating(false);
          setDeaneryId("");
          setSpecialtyId("");
        },
        onError: (e: Error) => toast.error(e.message),
      },
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-52" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-bold tracking-tight sm:text-2xl">Teaching registers</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Each specialty in each deanery keeps its own register. You see the ones you
            have been given access to.
          </p>
        </div>
        {canCreate && (
          <Button size="sm" className="w-full sm:w-auto" onClick={() => setCreating(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            New register
          </Button>
        )}
      </div>

      {/* ---------------------------------------------------------- yours -- */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Your registers</h2>

        {grouped.mine.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              You do not have access to any register yet. Ask for one below, or create it
              if it does not exist.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {grouped.mine.map((entry) => (
              <Card key={entry.id} className="transition-colors hover:border-primary/40">
                <CardContent className="flex flex-wrap items-center gap-x-3 gap-y-2 p-4">
                  <RegisterName entry={entry} />
                  <div className="flex-1" />
                  <MemberCount n={entry.member_count} />
                  <Button asChild size="sm" variant="outline" className="w-full sm:w-auto">
                    <Link
                      to={`/registers/${entry.slug}`}
                      onClick={() => setActiveRegisterSlug(entry.slug)}
                    >
                      Open <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* ------------------------------------------------------- awaiting -- */}
      {grouped.awaiting.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold">Waiting on a decision</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {grouped.awaiting.map((entry) => (
              <Card key={entry.id}>
                <CardContent className="flex flex-wrap items-center gap-x-3 gap-y-2 p-4">
                  <RegisterName entry={entry} />
                  <div className="flex-1" />
                  <Badge variant="secondary" className="gap-1 text-xs">
                    <Clock className="h-3 w-3" /> Requested
                  </Badge>
                </CardContent>
              </Card>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Anyone who already belongs to that register can approve this.
          </p>
        </section>
      )}

      {/* ------------------------------------------------------ available -- */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Other registers</h2>

        {grouped.available.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            There are no other registers to ask for.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {grouped.available.map((entry) => (
              <Card key={entry.id}>
                <CardContent className="flex flex-wrap items-center gap-x-3 gap-y-2 p-4">
                  <RegisterName entry={entry} />
                  <div className="flex-1" />
                  <MemberCount n={entry.member_count} />
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full sm:w-auto"
                    onClick={() => setRequesting(entry)}
                  >
                    Request access
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      <ArchiveSection />

      {/* -------------------------------------------------- request dialog -- */}
      <Dialog open={!!requesting} onOpenChange={(open) => !open && setRequesting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Request access to {requesting?.specialty_name}
            </DialogTitle>
            <DialogDescription>
              {requesting?.deanery_name}. Someone who already belongs to this register
              will decide.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="reason" className="text-xs">
              Why do you need access? <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Textarea
              id="reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. I organise the monthly teaching day for this programme."
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setRequesting(null)}>
              Cancel
            </Button>
            <Button onClick={submitRequest} disabled={requestAccess.isPending}>
              {requestAccess.isPending ? "Sending…" : "Send request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* --------------------------------------------------- create dialog -- */}
      <Dialog
        open={creating}
        onOpenChange={(open) => {
          setCreating(open);
          if (!open) { setDeaneryId(""); setSpecialtyId(""); }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create a register</DialogTitle>
            <DialogDescription>
              One register per specialty in each deanery. You become its owner, and can
              then admit other people to it.
            </DialogDescription>
          </DialogHeader>

          {deaneries && deaneries.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              There is no deanery you can create a register in. Registers can be started
              by an administrator, or by anyone who already belongs to one.
            </p>
          ) : (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="deanery" className="text-xs">Deanery</Label>
                <Select
                  value={deaneryId}
                  onValueChange={(v) => { setDeaneryId(v); setSpecialtyId(""); }}
                >
                  <SelectTrigger id="deanery">
                    <SelectValue placeholder="Choose a deanery" />
                  </SelectTrigger>
                  <SelectContent>
                    {(deaneries ?? []).map((d) => (
                      <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="specialty" className="text-xs">Specialty</Label>
                <Select value={specialtyId} onValueChange={setSpecialtyId} disabled={!deaneryId}>
                  <SelectTrigger id="specialty">
                    <SelectValue
                      placeholder={deaneryId ? "Choose a specialty" : "Choose a deanery first"}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {(creatable ?? []).map((sp) => (
                      <SelectItem key={sp.id} value={sp.id}>{sp.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {deaneryId && creatable && creatable.length === 0 && (
                  <p className="text-[11px] text-muted-foreground">
                    Every specialty already has a register in that deanery. If the one you
                    want is missing from the list entirely, it needs adding under
                    Admin → Specialties first.
                  </p>
                )}
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setCreating(false)}>
              Cancel
            </Button>
            <Button
              onClick={submitCreate}
              disabled={!deaneryId || !specialtyId || createRegister.isPending}
            >
              {createRegister.isPending ? "Creating…" : "Create register"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
