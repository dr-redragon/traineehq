import { useState } from "react";
import { PolicyLink } from "@/components/PolicyLink";
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
      <header className="sticky top-0 z-50 border-b-2 border-border bg-background">
        <div className="max-w-5xl mx-auto flex items-center justify-between px-6 h-16">
          <div className="flex items-center gap-3">
            <img src={logoDark} alt="NW HST Training Hub" className="h-8 w-8" />
            <span className="font-display text-lg font-extrabold tracking-tight">HST Training Hub</span>
          </div>
          <div className="flex items-center gap-4">
            <Link to="/request-access" className="text-sm font-medium text-foreground underline underline-offset-[3px] transition-colors hover:text-accent-700">
              Request Access
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="border-b-2 border-border bg-secondary">
        <div className="max-w-5xl mx-auto px-6 pt-16 pb-14 lg:pt-20 lg:pb-16">
          <div className="grid lg:grid-cols-[1.1fr_1fr] gap-14 items-start">
            {/* Left — copy */}
            <div className="animate-fade-in">
              <div className="mb-6 inline-flex items-center gap-2 border-l-2 border-rule bg-card px-3 py-1.5">
                <Stethoscope className="h-4 w-4 text-rule" />
                <span className="text-xs font-medium">For NHS Higher Specialty Trainees</span>
              </div>
              <h1 className="mb-5 font-display text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl">
                Your training, organised.
              </h1>
              <p className="text-lg text-muted-foreground leading-relaxed max-w-lg mb-8">
                A centralised resource hub for Higher Surgical and Medical Specialty Trainees.
                Access curricula, exam preparation, operative videos, and key contacts — all in one secure platform.
              </p>
              <ul className="flex flex-wrap items-center gap-x-8 gap-y-2 text-sm text-muted-foreground">
                {["30+ Specialties", "Discussion Boards", "GDPR Compliant"].map((item) => (
                  <li key={item} className="flex items-center gap-2">
                    <div className="h-1.5 w-1.5 bg-rule" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Right — login card */}
            <div id="login" className="animate-fade-in" style={{ animationDelay: "0.15s" }}>
              <Card className="border-2 border-border">
                <CardContent className="p-8">
                  <h2 className="mb-1 font-display text-2xl font-extrabold tracking-tight">Sign in</h2>
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
                        <Link to="/forgot-password" className="text-xs text-accent-700 underline underline-offset-4">
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

                  <p className="mt-6 text-[10px] text-muted-foreground">
                    By signing in you agree to our{" "}
                    <PolicyLink kind="privacy" className="text-accent-700 underline underline-offset-4" />
                    {" "}and{" "}
                    <PolicyLink kind="terms" className="text-accent-700 underline underline-offset-4" />.
                    <br />Essential cookies only — no tracking.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="bg-background">
        <div className="max-w-5xl mx-auto px-6 py-16 lg:py-20">
          <h2 className="mb-3 font-display text-[32px] font-extrabold leading-tight tracking-tight">
            Built for busy trainees
          </h2>
          <p className="text-muted-foreground max-w-lg mb-10">
            Everything you need for your training programme, accessible from any device.
          </p>
          <div className="ds-grid sm:grid-cols-3">
            {features.map((f, i) => (
              <div
                key={f.title}
                className="animate-fade-in p-6"
                style={{ animationDelay: `${0.1 * i + 0.3}s` }}
              >
                <f.icon className="mb-4 h-5 w-5 text-rule" />
                <h3 className="mb-2 font-display text-base font-extrabold tracking-tight">{f.title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>


      {/* Contact */}
      <ContactForm />

      {/* Footer */}
      <footer className="border-t-2 border-border bg-background">
        <div className="max-w-6xl mx-auto px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <img src={logoDark} alt="NW HST Training Hub" className="h-4 w-4" />
            <span className="text-sm text-muted-foreground">© 2026 HST Training Hub</span>
          </div>
          <div className="flex items-center gap-6 text-xs text-muted-foreground">
            <PolicyLink kind="privacy" className="underline underline-offset-4 hover:text-accent-700 transition-colors" />
            <PolicyLink kind="terms" className="underline underline-offset-4 hover:text-accent-700 transition-colors" />
            <PolicyLink kind="cookies" className="underline underline-offset-4 hover:text-accent-700 transition-colors" />
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
