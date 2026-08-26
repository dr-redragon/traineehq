import { useState } from "react";
import { Link } from "react-router-dom";
import { Mail, ArrowLeft, ArrowRight } from "lucide-react";
import logoWhite from "@/assets/logo-white.png";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

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
    <div className="min-h-screen flex">
      {/* Left branding panel */}
      <div className="hidden lg:flex lg:w-1/2 bg-primary relative overflow-hidden flex-col justify-between p-12">
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-16">
            <img src={logoWhite} alt="NW HST Training Hub" className="h-10 w-10" />
            <h1 className="text-xl font-display font-semibold text-primary-foreground tracking-tight">
              North West HST Training Hub
            </h1>
          </div>
          <h2 className="text-4xl font-display font-bold text-primary-foreground leading-tight mb-6">
            Reset your<br />password.
          </h2>
          <p className="text-primary-foreground/70 text-lg max-w-md leading-relaxed">
            We'll send you a link to reset your password and get back to your training resources.
          </p>
        </div>
        <p className="relative z-10 text-primary-foreground/40 text-sm">
          © 2026 North West HST Training Hub. All rights reserved.
        </p>
        <div className="absolute -bottom-32 -right-32 w-96 h-96 rounded-full border border-accent/10" />
        <div className="absolute -bottom-16 -right-16 w-64 h-64 rounded-full border border-accent/10" />
        <div className="absolute top-20 right-20 w-32 h-32 rounded-full bg-accent/5" />
      </div>

      {/* Right form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md animate-fade-in">
          <div className="lg:hidden flex items-center gap-3 mb-10">
            <img src={logoWhite} alt="NW HST Training Hub" className="h-9 w-9 rounded-lg bg-primary p-1" />
            <h1 className="text-lg font-display font-semibold tracking-tight">North West HST Training Hub</h1>
          </div>

          {sent ? (
            <div className="text-center space-y-4">
              <div className="h-16 w-16 rounded-full bg-accent/10 flex items-center justify-center mx-auto mb-4">
                <Mail className="h-8 w-8 text-accent" />
              </div>
              <h2 className="text-2xl font-display font-bold">Check your email</h2>
              <p className="text-muted-foreground">
                We've sent a password reset link to <strong>{email}</strong>. Click the link in the email to set a new password.
              </p>
              <Link to="/" className="inline-flex items-center gap-2 text-sm text-accent hover:underline font-medium mt-4">
                <ArrowLeft className="h-4 w-4" /> Back to sign in
              </Link>
            </div>
          ) : (
            <>
              <h2 className="text-2xl font-display font-bold mb-2">Forgot password?</h2>
              <p className="text-muted-foreground mb-8">
                Enter your email address and we'll send you a link to reset your password.
              </p>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="email">Email address</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="name@nhs.net"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="pl-10"
                      required
                    />
                  </div>
                </div>

                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? "Sending…" : "Send reset link"}
                  {!isLoading && <ArrowRight className="h-4 w-4" />}
                </Button>
              </form>

              <p className="text-center text-sm text-muted-foreground mt-6">
                <Link to="/" className="inline-flex items-center gap-1 text-accent hover:underline font-medium">
                  <ArrowLeft className="h-3 w-3" /> Back to sign in
                </Link>
              </p>

              <p className="text-center text-sm text-muted-foreground mt-3">
                Don't have an account?{" "}
                <Link to="/request-access" className="text-accent hover:underline font-medium">Request Access</Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ForgotPassword;
