import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { PolicyLink } from "@/components/PolicyLink";
import { PortalShell, portalField, portalKicker, portalLabel } from "@/components/PortalShell";
import { PasswordChecklist } from "@/components/PasswordChecklist";
import { passwordMeetsRules } from "@/lib/passwordRules";

/**
 * Setting a new password, in the same register as the door it leads back to.
 */
const ResetPassword = () => {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isRecovery, setIsRecovery] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setIsRecovery(true);
      }
    });
    return () => subscription.unsubscribe();
  }, []);
  void isRecovery;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    if (!passwordMeetsRules(password)) {
      toast.error("The password needs at least 8 characters, with letters and numbers");
      return;
    }
    setIsLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setIsLoading(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Password updated successfully");
      navigate("/dashboard");
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
          Set a new password
        </h2>
      </div>

      <p className="text-pretty text-[14.5px] text-muted-foreground">
        Choose a password of at least 8 characters that mixes letters and numbers.
      </p>

      <form onSubmit={handleSubmit} className="space-y-[18px]">
        <div className="space-y-2">
          <Label htmlFor="password" className={portalLabel}>New password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={portalField}
            required
            minLength={8}
            aria-describedby="password-requirements"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirmPassword" className={portalLabel}>Confirm new password</Label>
          <Input
            id="confirmPassword"
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className={portalField}
            required
            minLength={8}
          />
        </div>

        <PasswordChecklist id="password-requirements" password={password} confirm={confirmPassword} />

        <Button
          type="submit"
          className="h-12 w-full justify-between text-[15px]"
          disabled={isLoading || !passwordMeetsRules(password) || password !== confirmPassword}
        >
          {isLoading ? "Updating…" : "Update password"}
          {!isLoading && <ArrowRight className="h-4 w-4" />}
        </Button>
      </form>
    </PortalShell>
  );
};

export default ResetPassword;
