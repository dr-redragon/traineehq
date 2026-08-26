import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  Mail, Lock, ArrowRight, Stethoscope,
  GraduationCap, FolderOpen, Shield, ChevronRight,
} from "lucide-react";
import logoDark from "@/assets/logo-dark.png";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import ContactForm from "@/components/ContactForm";

const features = [
  {
    icon: FolderOpen,
    title: "Organised Resources",
    desc: "Curricula, guidelines, operative videos, and exam prep — all in one place, sorted by specialty.",
  },
  {
    icon: GraduationCap,
    title: "Specialty Training",
    desc: "Dedicated pages for every surgical and medical subspecialty with curated learning materials.",
  },
  {
    icon: Shield,
    title: "Secure & GDPR Compliant",
    desc: "Encrypted security with role-based access. Your data is never shared with third parties.",
  },
];

const Landing = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);

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
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <header className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-6 h-16">
          <div className="flex items-center gap-3">
            <img src={logoDark} alt="NW HST Training Hub" className="h-9 w-9" />
            <span className="font-display font-semibold text-lg tracking-tight">HST Training Hub</span>
          </div>
          <div className="flex items-center gap-4">
            <Link to="/request-access" className="text-sm text-muted-foreground hover:text-accent font-medium transition-colors">
              Request Access
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        {/* Background decoration */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-40 -right-40 w-[500px] h-[500px] rounded-full bg-accent/5" />
          <div className="absolute top-20 -left-20 w-72 h-72 rounded-full bg-primary/5" />
        </div>

        <div className="max-w-6xl mx-auto px-6 pt-20 pb-16 lg:pt-28 lg:pb-24">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            {/* Left — copy */}
            <div className="animate-fade-in">
              <div className="inline-flex items-center gap-2 rounded-full bg-accent/10 px-4 py-1.5 mb-6">
                <Stethoscope className="h-4 w-4 text-accent" />
                <span className="text-xs font-medium text-accent">For NHS Higher Specialty Trainees</span>
              </div>
              <h1 className="text-4xl sm:text-5xl font-display font-bold leading-[1.15] mb-5">
                Your training,
                <br />
                <span className="text-accent">organised.</span>
              </h1>
              <p className="text-lg text-muted-foreground leading-relaxed max-w-lg mb-8">
                A centralised resource hub for Higher Surgical and Medical Specialty Trainees.
                Access curricula, exam preparation, operative videos, and key contacts — all in one secure platform.
              </p>
              <div className="flex items-center gap-6 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-accent" />
                  <span>30+ Specialties</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-accent" />
                  <span>Discussion Boards</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-accent" />
                  <span>GDPR Compliant</span>
                </div>
              </div>
            </div>

            {/* Right — login card */}
            <div id="login" className="animate-fade-in" style={{ animationDelay: "0.15s" }}>
              <Card className="shadow-lg border-border/60">
                <CardContent className="p-8">
                  <h2 className="text-xl font-display font-bold mb-1">Sign in</h2>
                  <p className="text-sm text-muted-foreground mb-6">
                    Access your training resources
                  </p>

                  <form onSubmit={handleLogin} className="space-y-4">
                    <div className="space-y-1.5">
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

                    <div className="space-y-1.5">
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

                  <p className="text-center text-[10px] text-muted-foreground mt-6">
                    By signing in you agree to our{" "}
                    <a href="#" className="text-accent hover:underline">Privacy Policy</a>
                    {" "}and{" "}
                    <a href="#" className="text-accent hover:underline">Terms of Use</a>.
                    <br />Essential cookies only — no tracking.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="bg-secondary/30 border-t">
        <div className="max-w-6xl mx-auto px-6 py-16 lg:py-20">
          <h2 className="text-2xl font-display font-bold text-center mb-3">
            Built for busy trainees
          </h2>
          <p className="text-muted-foreground text-center max-w-lg mx-auto mb-12">
            Everything you need for your training programme, accessible from any device.
          </p>
          <div className="grid sm:grid-cols-3 gap-6">
            {features.map((f, i) => (
              <Card
                key={f.title}
                className="border-border/60 hover:shadow-md transition-shadow animate-fade-in"
                style={{ animationDelay: `${0.1 * i + 0.3}s` }}
              >
                <CardContent className="p-6">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10 mb-4">
                    <f.icon className="h-5 w-5 text-accent" />
                  </div>
                  <h3 className="font-semibold text-sm mb-2">{f.title}</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">{f.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Contact */}
      <ContactForm />

      {/* Footer */}
      <footer className="border-t bg-card">
        <div className="max-w-6xl mx-auto px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <img src={logoDark} alt="NW HST Training Hub" className="h-4 w-4" />
            <span className="text-sm text-muted-foreground">© 2026 HST Training Hub</span>
          </div>
          <div className="flex items-center gap-6 text-xs text-muted-foreground">
            <a href="#" className="hover:text-accent transition-colors">Privacy Policy</a>
            <a href="#" className="hover:text-accent transition-colors">Terms of Use</a>
            <a href="#" className="hover:text-accent transition-colors">Cookie Policy</a>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
