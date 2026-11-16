import { useState } from "react";
import { toast } from "sonner";
import { Button, type ButtonProps } from "@/components/ui/button";
import { PRICE_LABEL } from "@/lib/brand";
import { startCheckout } from "@/lib/register/api";

/** Sends the browser to Stripe Checkout. The charge, and the receipt, are Stripe's. */
export function UpgradeButton({ children, ...props }: ButtonProps) {
  const [busy, setBusy] = useState(false);

  const go = async () => {
    setBusy(true);
    try {
      window.location.assign(await startCheckout());
    } catch (error) {
      setBusy(false);
      toast.error(error instanceof Error ? error.message : "Could not open the checkout");
    }
  };

  return (
    <Button type="button" onClick={go} disabled={busy} {...props}>
      {busy ? "Opening checkout…" : children ?? (PRICE_LABEL ? `Subscribe — ${PRICE_LABEL}` : "Subscribe")}
    </Button>
  );
}
