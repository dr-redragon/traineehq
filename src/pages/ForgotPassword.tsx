import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { PolicyLink } from "@/components/PolicyLink";
import { PortalShell, portalField, portalKicker, portalLabel } from "@/components/PortalShell";

/**
 * Asking for a reset link, in the same register as the door it is reached from.
 */
const ForgotPassword = () => {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setIsLoading(false);
    if (error) {
      toast.error(error.message);
    } else {
      setSent(true);
    }
  };

  return (
    <PortalShell
      footerLinks={
        <>
          <PolicyLink kind="privacy" className="text-accent-deep underline underline-offset-4" />
          <PolicyLink kind="terms" className="text-accent-deep underline underline-offset-4" />
          <Link to="/contact" className="text-accent-deep underline underline-offset-4">
            Contact us
          </Link>
        </>
      }
    >
      <div className="space-y-1.5">
        <span className={portalKicker}>Account</span>
        <h2 className="font-display text-[clamp(26px,6.5vw,34px)] font-extrabold leading-[1.04] tracking-[-0.03em]">
          Reset your password
        </h2>
      </div>

      {sent ? (
        <div className="space-y-4 border-2 border-foreground p-6">
          <h3 className="font-display text-2xl font-extrabold tracking-tight">Check your email</h3>
          <p className="text-pretty text-sm text-muted-foreground">
            A reset link is on its way to <strong className="text-foreground">{email}</strong>.
            Open it to set a new password.
          </p>
          <Button asChild variant="outline" className="h-11 w-full">
            <Link to="/">Back to sign in</Link>
          </Button>
        </div>
      ) : (
        <>
          <p className="text-pretty text-[14.5px] text-muted-foreground">
            Enter your email address and we&apos;ll send you a link to set a new one.
          </p>

          <form onSubmit={handleSubmit} className="space-y-[18px]">
            <div className="space-y-2">
              <Label htmlFor="email" className={portalLabel}>Email address</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={portalField}
                required
              />
            </div>

            <Button
              type="submit"
              className="h-12 w-full justify-between text-[15px]"
              disabled={isLoading}
            >
              {isLoading ? "Sending…" : "Send reset link"}
              {!isLoading && <ArrowRight className="h-4 w-4" />}
            </Button>
          </form>

          <p className="text-[13px] text-muted-foreground">
            <Link to="/" className="text-accent-deep underline underline-offset-4">
              Back to sign in
            </Link>
          </p>
        </>
      )}
    </PortalShell>
  );
};

export default ForgotPassword;
