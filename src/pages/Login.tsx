import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Mail, Lock, ArrowRight } from "lucide-react";
import logoWhite from "@/assets/logo-white.png";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import ContactForm from "@/components/ContactForm";

const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setIsLoading(false);
    if (error) {
      toast.error(error.message);
    } else {
      navigate("/dashboard");
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left - branding panel */}
      <div className="hidden lg:flex lg:w-1/2 bg-primary relative overflow-hidden flex-col justify-between p-12">
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-16">
            <img src={logoWhite} alt="NW HST Training Hub" className="h-10 w-10" />
            <h1 className="text-xl font-display font-semibold text-primary-foreground tracking-tight">
              North West HST Training Hub
            </h1>
          </div>
          <h2 className="text-4xl font-display font-bold text-primary-foreground leading-tight mb-6">
            Your training,<br />organised.
          </h2>
          <p className="text-primary-foreground/70 text-lg max-w-md leading-relaxed">
            A centralised resource platform for Higher Specialty Trainees across the North West Deanery.
          </p>
        </div>
        <p className="relative z-10 text-primary-foreground/40 text-sm">
          © 2026 North West HST Training Hub. All rights reserved.
        </p>
        {/* Decorative circles */}
        <div className="absolute -bottom-32 -right-32 w-96 h-96 rounded-full border border-accent/10" />
        <div className="absolute -bottom-16 -right-16 w-64 h-64 rounded-full border border-accent/10" />
        <div className="absolute top-20 right-20 w-32 h-32 rounded-full bg-accent/5" />
      </div>

      {/* Right - login form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md animate-fade-in">
          <div className="lg:hidden flex items-center gap-3 mb-10">
            <img src={logoWhite} alt="NW HST Training Hub" className="h-9 w-9 rounded-lg bg-primary p-1" />
            <h1 className="text-lg font-display font-semibold tracking-tight">North West HST Training Hub</h1>
          </div>

          <h2 className="text-2xl font-display font-bold mb-2">Welcome back</h2>
          <p className="text-muted-foreground mb-8">Sign in to access your training resources</p>

          <form onSubmit={handleLogin} className="space-y-5">
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

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <Link to="/forgot-password" className="text-xs text-accent hover:underline">
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10"
                  required
                />
              </div>
            </div>

            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? "Signing in…" : "Sign in"}
              {!isLoading && <ArrowRight className="h-4 w-4" />}
            </Button>
          </form>

          <p className="text-center text-sm text-muted-foreground mt-6">
            Don't have an account?{" "}
            <Link to="/request-access" className="text-accent hover:underline font-medium">Request Access</Link>
          </p>

          <p className="text-center text-xs text-muted-foreground mt-4">
            By signing in, you agree to our{" "}
            <a href="#" className="text-accent hover:underline">Privacy Policy</a>{" "}
            and{" "}
            <a href="#" className="text-accent hover:underline">Terms of Use</a>.
          </p>
          <div className="mt-8 pt-6 border-t">
            <ContactForm compact />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
