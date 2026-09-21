import { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import logoWhite from "@/assets/logo-white.png";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { safeDestination } from "@/lib/safeDestination";
import { rememberSignIn } from "@/lib/sessionPersistence";
import { PolicyLink } from "@/components/PolicyLink";

/**
 * The poster panel's foot. Three claims the site already makes on its front
 * page, set as the design's value-over-label trio rather than a bullet list.
 */
const stats = [
  { value: "30+", label: "Specialties" },
  { value: "24/7", label: "Any device" },
  { value: "GDPR", label: "Compliant" },
];

const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [keepSignedIn, setKeepSignedIn] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  /**
   * Where to go once signed in.
   *
   * RequireAuth has always passed the page it turned somebody away from, and
   * this page has always ignored it — so following a deep link while signed out
   * landed you on the dashboard, with the thing you had clicked forgotten. The
   * register's own door sends people here the same way.
   *
   * safeDestination is what keeps this from being an open redirect.
   */
  const destination = safeDestination(
    (location.state as { from?: unknown } | null)?.from,
    "/dashboard",
  );

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setIsLoading(false);
    if (error) {
      toast.error(error.message);
    } else {
      rememberSignIn(keepSignedIn);
      navigate(destination, { replace: true });
    }
  };

  return (
    <div className="min-h-screen bg-background lg:grid lg:grid-cols-[minmax(0,1fr)_620px]">
      {/*
        The poster panel. Ink in both themes — it is the page's one printed
        surface, not a surface that follows the ground, so it takes the ink
        ramp directly rather than a ground-relative token.
      */}
      <aside className="hidden flex-col justify-between bg-ink-900 p-12 text-ink-100 lg:flex">
        <div className="flex items-center gap-3">
          <img src={logoWhite} alt="" className="h-8 w-8" />
          <span className="font-display text-xl font-extrabold tracking-tight">TraineeHQ</span>
        </div>

        <div className="max-w-[640px] space-y-7">
          <h1 className="font-display text-[56px] font-extrabold leading-[0.94] tracking-[-0.035em] text-pretty xl:text-[76px]">
            Everything for your training year, in one place.
          </h1>
          <p className="max-w-[480px] text-pretty text-base leading-relaxed text-ink-400">
            Curricula, exam preparation, operative videos, key contacts and the specialty
            discussion boards — curated for Higher Specialty Trainees.
          </p>
        </div>

        <dl className="grid grid-cols-3 border-t border-ink-100/25">
          {stats.map((stat) => (
            <div key={stat.label} className="flex flex-col gap-1.5 pr-5 pt-5">
              <dt className="font-display text-[34px] font-extrabold leading-none tracking-tight">
                {stat.value}
              </dt>
              <dd className="text-[11.5px] uppercase tracking-[0.12em] text-ink-500">
                {stat.label}
              </dd>
            </div>
          ))}
        </dl>
      </aside>

      {/* The form column. */}
      <div className="flex min-h-screen flex-col">
        <div className="flex h-[60px] shrink-0 items-center justify-between gap-4 border-b-2 border-border px-6 text-sm text-muted-foreground lg:px-11">
          <span className="text-xs font-bold uppercase tracking-[0.12em] text-foreground">
            Sign in
          </span>
          <span>
            <span className="hidden sm:inline">Need an account? </span>
            <Link
              to="/request-access"
              className="font-medium text-accent-deep underline underline-offset-4"
            >
              Request access
            </Link>
          </span>
        </div>

        <div className="flex flex-1 animate-fade-in flex-col gap-7 px-6 py-12 lg:px-11 lg:py-[52px]">
          {/* The wordmark the poster panel carries, for the widths that hide it. */}
          <div className="flex items-center gap-3 lg:hidden">
            <img src={logoWhite} alt="" className="h-8 w-8 bg-ink-900 p-1" />
            <span className="font-display text-lg font-extrabold tracking-tight">TraineeHQ</span>
          </div>

          <div className="space-y-2">
            <h2 className="font-display text-[34px] font-extrabold leading-[1.05] tracking-[-0.025em] sm:text-[38px]">
              Welcome back
            </h2>
            <p className="text-[14.5px] text-muted-foreground">
              Use the address your account was registered with.
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-[18px]">
            <div className="space-y-2">
              <Label htmlFor="email">Email address</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-11 px-3.5 text-[15px]"
                required
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-baseline justify-between gap-3">
                <Label htmlFor="password">Password</Label>
                <Link
                  to="/forgot-password"
                  className="text-[13px] text-accent-deep underline underline-offset-4"
                >
                  Forgot password
                </Link>
              </div>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-11 px-3.5 text-[15px]"
                required
              />
            </div>

            <div className="flex items-center gap-2.5">
              <Checkbox
                id="keep-signed-in"
                checked={keepSignedIn}
                onCheckedChange={(checked) => setKeepSignedIn(checked === true)}
              />
              <Label htmlFor="keep-signed-in" className="text-sm font-normal">
                Keep me signed in on this device
              </Label>
            </div>

            {/*
              Modernist sets a full-width button's label flush left rather than
              centred, with the arrow carried out to the far edge.
            */}
            <Button
              type="submit"
              className="h-12 w-full justify-between text-[15px]"
              disabled={isLoading}
            >
              {isLoading ? "Signing in…" : "Sign in"}
              {!isLoading && <ArrowRight className="h-4 w-4" />}
            </Button>
          </form>

          <div className="mt-auto space-y-1.5 border-t-2 border-foreground pt-[18px]">
            <p className="text-pretty text-[12.5px] text-muted-foreground">
              Access is restricted to trainees and educators on the training programme.
              Accounts are approved manually.
            </p>
            <div className="flex gap-[18px] text-[12.5px]">
              <PolicyLink
                kind="privacy"
                className="text-accent-deep underline underline-offset-4"
              />
              <PolicyLink kind="terms" className="text-accent-deep underline underline-offset-4" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
