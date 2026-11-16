import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, CalendarDays, Lock, Plus, Repeat, Users } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { ArchiveSection } from "@/components/register/ArchiveSection";
import { UpgradeButton } from "@/components/app/UpgradeButton";
import { useCreateRegister, usePlan, useRegisterDirectory } from "@/hooks/useRegisters";
import { cn } from "@/lib/utils";
import { PURCHASES_ENABLED } from "@/lib/native";
import type { RegisterDirectoryEntry, RegisterKind } from "@/lib/register/types";

function KindBadge({ kind }: { kind: RegisterKind }) {
  return kind === "event"
    ? <Badge variant="secondary" className="gap-1"><CalendarDays className="h-3 w-3" /> Event</Badge>
    : <Badge className="gap-1"><Repeat className="h-3 w-3" /> Regular</Badge>;
}

function RegisterCard({ entry }: { entry: RegisterDirectoryEntry }) {
  return (
    <Link to={`/registers/${entry.slug}`} className="group block focus-visible:outline-none">
      <Card className="h-full transition-colors group-hover:bg-accent group-focus-visible:ring-2 group-focus-visible:ring-ring">
        <CardContent className="flex h-full flex-col gap-4 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <KindBadge kind={entry.kind} />
            {!entry.entitled && (
              <Badge variant="outline" className="gap-1"><Lock className="h-3 w-3" /> Read-only</Badge>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="break-words font-display text-xl font-extrabold leading-tight tracking-tight">
              {entry.name}
            </h3>
            {entry.organisation && (
              <p className="mt-1 truncate text-sm text-muted-foreground">{entry.organisation}</p>
            )}
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Users className="h-3.5 w-3.5" />
              {entry.member_count} {entry.member_count === 1 ? "member" : "members"}
              {entry.i_am_owner ? " · you own this" : ""}
            </span>
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

/** One of the two choices in the create form. A radio, drawn as a card. */
function KindChoice({
  value, selected, onSelect, title, price, children,
}: {
  value: RegisterKind; selected: boolean; onSelect: (k: RegisterKind) => void;
  title: string; price: string; children: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={() => onSelect(value)}
      className={cn(
        "border-2 p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        selected ? "border-foreground bg-accent" : "border-border hover:border-foreground/50",
      )}
    >
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-accent-deep">{price}</p>
      <p className="mt-1 font-display text-base font-extrabold">{title}</p>
      <p className="mt-1 text-xs text-muted-foreground">{children}</p>
    </button>
  );
}

function CreateRegisterDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const navigate = useNavigate();
  const { data: plan } = usePlan();
  const create = useCreateRegister();
  const [kind, setKind] = useState<RegisterKind>("event");
  const [name, setName] = useState("");
  const [organisation, setOrganisation] = useState("");

  const days = plan?.event_max_days ?? 7;
  const needsPlan = kind === "regular" && !plan?.subscribed;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (needsPlan || name.trim().length < 2) return;
    create.mutate(
      { name, kind, organisation },
      {
        onSuccess: ({ slug }) => {
          onOpenChange(false);
          setName(""); setOrganisation("");
          toast.success("Register created.");
          // Straight to where the first day is added.
          navigate(`/registers/${slug}?tab=day`);
        },
        onError: (err: Error) => toast.error(err.message),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit} className="space-y-5">
          <DialogHeader>
            <DialogTitle>New register</DialogTitle>
            <DialogDescription>
              You become its owner, and can invite colleagues to run it with you.
            </DialogDescription>
          </DialogHeader>

          <div role="radiogroup" aria-label="Kind of register" className="grid gap-3 sm:grid-cols-2">
            <KindChoice value="event" selected={kind === "event"} onSelect={setKind}
              title="Event" price="Free">
              {`One conference, course or study day — up to ${days} days.`}
            </KindChoice>
            <KindChoice value="regular" selected={kind === "regular"} onSelect={setKind}
              title="Regular" price={plan?.subscribed ? "Included in your plan" : PURCHASES_ENABLED ? "Subscription" : "Not in your plan"}>
              Teaching that runs through the year: attendance rates, leave, excusals.
            </KindChoice>
          </div>

          {needsPlan ? (
            <div className="space-y-3 border-l-4 border-rule bg-card p-4">
              {PURCHASES_ENABLED && (
                <p className="text-sm">
                  <strong>Regular registers are part of the subscription.</strong> One
                  subscription covers every regular register you own, and the colleagues you
                  invite do not need one.
                </p>
              )}
              <UpgradeButton />
            </div>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="register-name">Name</Label>
                <Input id="register-name" required minLength={2} maxLength={80} autoFocus
                  placeholder={kind === "event" ? "Spring Study Day 2027" : "ENT regional teaching"}
                  value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="register-organisation">
                  Organisation <span className="font-normal text-muted-foreground">(optional)</span>
                </Label>
                <Input id="register-organisation" maxLength={80}
                  placeholder="Printed on certificates, above the name"
                  value={organisation} onChange={(e) => setOrganisation(e.target.value)} />
              </div>
            </>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            {!needsPlan && (
              <Button type="submit" disabled={create.isPending || name.trim().length < 2}>
                {create.isPending ? "Creating…" : "Create register"}
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Your registers. Only yours: there is no directory of other people's, and
 * the way into somebody else's register is an invitation from its owner.
 */
export default function Directory() {
  const { data: registers, isLoading, error } = useRegisterDirectory();
  const [creating, setCreating] = useState(false);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-accent-deep">Registers</p>
          <h1 className="mt-1.5 font-display text-3xl font-extrabold leading-none tracking-[-0.03em] sm:text-[42px]">
            Your registers
          </h1>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="mr-1.5 h-4 w-4" /> New register
        </Button>
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-40" /><Skeleton className="h-40" />
        </div>
      ) : error ? (
        <p className="border-l-4 border-rule pl-3 text-sm">
          Your registers could not be loaded: {(error as Error).message}
        </p>
      ) : !registers?.length ? (
        <Card>
          <CardContent className="space-y-4 py-12 text-center">
            <h2 className="font-display text-xl font-extrabold">No registers yet</h2>
            <p className="mx-auto max-w-md text-sm text-muted-foreground">
              Create one for a conference or course — that is free — or for teaching that
              runs all year. If a colleague has invited you to theirs, it appears here once
              you open the link in their email.
            </p>
            <Button onClick={() => setCreating(true)}>
              <Plus className="mr-1.5 h-4 w-4" /> Create your first register
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {registers.map((r) => <RegisterCard key={r.id} entry={r} />)}
        </div>
      )}

      <ArchiveSection />

      <CreateRegisterDialog open={creating} onOpenChange={setCreating} />
    </div>
  );
}
