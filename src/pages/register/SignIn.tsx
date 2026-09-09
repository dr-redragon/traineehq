import { useEffect, useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { ArrowRight, ClipboardList, Lock, Mail } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { safeDestination } from "@/lib/safeDestination";
import logoDark from "@/assets/logo-dark.png";

/** Where to land once signed in, when nothing better was asked for. */
const DEFAULT_DESTINATION = "/registers";

/**
 * The register's own front door.
 *
 * Stage 9 of the integration plan. `/registers` already renders its own shell
 * and needs no TraineeHQ chrome, but a signed-out visitor was still bounced to
 * TraineeHQ's `/login` — which greets an organiser who has only ever used the
 * teaching register with a page about curricula and exam preparation, then
 * drops them on a dashboard rather than the register they were opening.
 *
 * Both routes in lead to the same Supabase Auth and the same account. The
 * choice on offer is not two identities, it is two framings of one: people who
 * think of this as TraineeHQ, and people who think of it as the register.
 */
export default function RegisterSignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  // Where the guard was sending them before it found no session.
  const destination = safeDestination(
    (location.state as { from?: unknown } | null)?.from,
    DEFAULT_DESTINATION,
  );

  // Somebody already signed in should not be looking at a sign-in page —
  // reachable by using a bookmark to it in a tab that still holds a session.
  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (!cancelled && data.session) navigate(destination, { replace: true });
    });
    return () => { cancelled = true; };
  }, [navigate, destination]);

  const signIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    navigate(destination, { replace: true });
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-4">
          <img src={logoDark} alt="" className="h-7 w-auto" />
          <span className="font-display text-sm font-semibold tracking-tight">
            Teaching registers
          </span>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-sm animate-fade-in space-y-6">
          <div className="space-y-2 text-center">
            <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-accent/10">
              <ClipboardList className="h-5 w-5 text-accent" />
            </div>
            <h1 className="font-display text-xl font-bold">Sign in to the register</h1>
            <p className="text-sm text-muted-foreground">
              Attendance, teaching days and reports for the specialties you help run.
            </p>
          </div>

          <form onSubmit={signIn} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="register-email">Email address</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="register-email"
                  type="email"
                  autoComplete="username"
                  required
                  className="pl-9"
                  placeholder="name@nhs.net"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="register-password">Password</Label>
                <Link
                  to="/forgot-password"
                  className="text-xs text-accent hover:underline"
                >
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="register-password"
                  type="password"
                  autoComplete="current-password"
                  required
                  className="pl-9"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>

            <Button type="submit" className="w-full gap-1.5" disabled={busy}>
              {busy ? "Signing in…" : "Sign in"} <ArrowRight className="h-4 w-4" />
            </Button>
          </form>

          <div className="flex items-center gap-3">
            <Separator className="flex-1" />
            <span className="text-xs text-muted-foreground">or</span>
            <Separator className="flex-1" />
          </div>

          {/*
            The same account either way. This is a signpost rather than a second
            identity provider: someone who thinks of this as TraineeHQ gets the
            page they recognise, and lands back here afterwards.
          */}
          <Button asChild variant="outline" className="w-full">
            <Link to="/login" state={{ from: destination }}>
              Sign in with TraineeHQ
            </Link>
          </Button>

          <p className="text-center text-xs text-muted-foreground">
            Access to a register is granted per person by whoever runs it — it is not
            the same thing as a TraineeHQ role. Sign in first, then ask for access from
            the register directory.
          </p>
        </div>
      </main>
    </div>
  );
}
