import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Clock, Plus, Users } from "lucide-react";
import { toast } from "sonner";
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
  useCreatableSpecialties, useCreateRegister, useGroupedRegisters, useRequestRegisterAccess,
} from "@/hooks/useRegisters";
import { useRegister } from "@/contexts/RegisterContext";
import { useUserRole } from "@/hooks/useUserRole";
import type { RegisterDirectoryEntry } from "@/lib/register/types";

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

export default function RegisterDirectory() {
  const { grouped, isLoading } = useGroupedRegisters();
  const { setActiveRegisterSlug } = useRegister();
  const { data: role } = useUserRole();

  const [requesting, setRequesting] = useState<RegisterDirectoryEntry | null>(null);
  const [reason, setReason] = useState("");
  const [creating, setCreating] = useState(false);
  const [specialtyId, setSpecialtyId] = useState("");

  const requestAccess = useRequestRegisterAccess();
  const createRegister = useCreateRegister();
  const { data: creatable } = useCreatableSpecialties(creating);

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
    if (!specialtyId) return;
    createRegister.mutate(
      { specialtyId },
      {
        onSuccess: () => {
          toast.success("Register created. You are its owner.");
          setCreating(false);
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
          <h1 className="font-display text-xl font-semibold tracking-tight sm:text-2xl">Teaching registers</h1>
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
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create a register</DialogTitle>
            <DialogDescription>
              One register per specialty. You become its owner, and can then admit
              other people to it.
            </DialogDescription>
          </DialogHeader>

          {creatable && creatable.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Every specialty you can see already has a register. If the one you want is
              missing, it needs adding under Admin → Specialties first.
            </p>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="specialty" className="text-xs">Specialty</Label>
              <Select value={specialtyId} onValueChange={setSpecialtyId}>
                <SelectTrigger id="specialty">
                  <SelectValue placeholder="Choose a specialty" />
                </SelectTrigger>
                <SelectContent>
                  {(creatable ?? []).map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setCreating(false)}>
              Cancel
            </Button>
            <Button
              onClick={submitCreate}
              disabled={!specialtyId || createRegister.isPending}
            >
              {createRegister.isPending ? "Creating…" : "Create register"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
