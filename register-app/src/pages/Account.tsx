import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { UpgradeButton } from "@/components/app/UpgradeButton";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { usePlan, useRegisterDirectory } from "@/hooks/useRegisters";
import { supabase } from "@/integrations/supabase/client";
import { deleteAccount, openBillingPortal } from "@/lib/register/api";
import { PURCHASES_ENABLED } from "@/lib/native";

const PROVIDER_NAMES: Record<string, string> = { google: "Google", apple: "Apple", azure: "NHSmail" };

const day = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

/**
 * Who you are signed in as, what you are paying for, and the way out.
 *
 * Billing itself lives at Stripe: this page starts a checkout or opens
 * Stripe's own portal, and shows what the webhook has told the database.
 */
export default function Account() {
  const { data: user } = useCurrentUser();
  const { data: plan, isLoading } = usePlan();
  const { data: registers } = useRegisterDirectory();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [opening, setOpening] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Back from Stripe. The webhook usually lands within a second or two of the
  // redirect, but not always before it — so ask again a few times rather than
  // show "Free" to somebody who has just paid.
  const returned = params.get("checkout");
  useEffect(() => {
    if (returned !== "success") return;
    toast.success("Thank you — your subscription is being activated.");
    const refresh = () => {
      queryClient.invalidateQueries({ queryKey: ["plan"] });
      queryClient.invalidateQueries({ queryKey: ["register-directory"] });
    };
    const timers = [0, 2000, 5000, 10000].map((ms) => window.setTimeout(refresh, ms));
    setParams({}, { replace: true });
    return () => timers.forEach(window.clearTimeout);
    // Runs once for the redirect; clearing the param must not cancel the timers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const portal = async () => {
    setOpening(true);
    try {
      window.location.assign(await openBillingPortal());
    } catch (error) {
      setOpening(false);
      toast.error(error instanceof Error ? error.message : "Could not open billing");
    }
  };

  const destroy = async () => {
    setDeleting(true);
    try {
      await deleteAccount();
      await supabase.auth.signOut();
      toast.success("Your account has been deleted.");
      navigate("/", { replace: true });
    } catch (error) {
      setDeleting(false);
      toast.error(error instanceof Error ? error.message : "Could not delete the account");
    }
  };

  const meta = (user?.user_metadata ?? {}) as { full_name?: string; name?: string };
  const provider = PROVIDER_NAMES[String(user?.app_metadata?.provider ?? "")] ?? "a provider";
  const owned = (registers ?? []).filter((r) => r.i_am_owner);
  const lapsedRegular = owned.filter((r) => r.kind === "regular" && !r.entitled).length;

  return (
    <div className="mx-auto max-w-3xl space-y-10">
      <div>
        <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-accent-deep">Account</p>
        <h1 className="mt-1.5 font-display text-3xl font-extrabold leading-none tracking-[-0.03em] sm:text-[42px]">
          {meta.full_name || meta.name || "Your account"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {user?.email} · signed in with {provider}
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Plan</h2>
        {isLoading || !plan ? <Skeleton className="h-40 w-full" /> : (
          <Card>
            <CardContent className="space-y-4 p-5">
              <div className="flex flex-wrap items-center gap-3">
                <h3 className="font-display text-2xl font-extrabold tracking-tight">
                  {plan.subscribed ? "Subscribed" : "Free"}
                </h3>
                {plan.status === "past_due" && <Badge variant="destructive">Payment overdue</Badge>}
                {plan.status === "comp" && <Badge variant="secondary">Complimentary</Badge>}
                {plan.subscribed && plan.cancel_at_period_end && <Badge variant="outline">Ending</Badge>}
              </div>

              {plan.subscribed ? (
                <p className="text-sm text-muted-foreground">
                  You can create regular registers, and every regular register you own stays
                  open for the colleagues you have invited.
                  {plan.current_period_end && (plan.cancel_at_period_end
                    ? ` Your subscription ends on ${day(plan.current_period_end)}; after that your regular registers become read-only until you subscribe again.`
                    : ` Renews on ${day(plan.current_period_end)}.`)}
                </p>
              ) : (
                <>
                  <ul className="space-y-1.5 text-sm text-muted-foreground">
                    {(PURCHASES_ENABLED ? [
                      `Free: event registers — one conference or course each, up to ${plan.event_max_days} days`,
                      "Subscription: regular registers for teaching that runs all year",
                      "One subscription covers every regular register you own; collaborators never pay",
                    ] : [
                      `Event registers — one conference or course each, up to ${plan.event_max_days} days`,
                      "Registers you are invited to, at whatever access their owner gives you",
                    ]).map((line) => (
                      <li key={line} className="flex gap-2">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent-deep" /> {line}
                      </li>
                    ))}
                  </ul>
                  {lapsedRegular > 0 && (
                    <p className="border-l-4 border-rule pl-3 text-sm">
                      {lapsedRegular === 1
                        ? "One regular register you own is read-only."
                        : `${lapsedRegular} regular registers you own are read-only.`}{" "}
                      Nothing has been deleted{PURCHASES_ENABLED ? "; subscribing makes them editable again" : ""}.
                    </p>
                  )}
                </>
              )}

              <div className="flex flex-wrap gap-2">
                {!plan.subscribed && <UpgradeButton />}
                {plan.managed_by_stripe && PURCHASES_ENABLED && (
                  <Button variant="outline" onClick={portal} disabled={opening}>
                    {opening ? "Opening…" : "Manage billing"}
                  </Button>
                )}
              </div>
              {plan.managed_by_stripe && PURCHASES_ENABLED && (
                <p className="text-xs text-muted-foreground">
                  Card details, invoices and cancelling are handled on Stripe's own pages.
                </p>
              )}
            </CardContent>
          </Card>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-accent-700 dark:text-accent-400">Delete your account</h2>
        <Card className="border border-accent-600/40">
          <CardContent className="flex flex-wrap items-center gap-3 p-5">
            <p className="min-w-[240px] flex-1 text-sm text-muted-foreground">
              Removes your sign-in, cancels any subscription, and permanently deletes the
              registers that only you own — with their attendance, feedback and
              certificates. Registers with another owner carry on without you.
            </p>
            <Button className="bg-accent-600 text-white hover:bg-accent-700" onClick={() => setConfirming(true)}>
              Delete account
            </Button>
          </CardContent>
        </Card>
      </section>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete your account?</AlertDialogTitle>
            <AlertDialogDescription>
              This cannot be undone. The registers that only you own are destroyed at once —
              they do not go to the archive. To keep one, make a colleague an owner of it first.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-accent-600 text-white hover:bg-accent-700"
              disabled={deleting}
              onClick={(e) => { e.preventDefault(); void destroy(); }}
            >
              {deleting ? "Deleting…" : "Yes, delete everything"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
