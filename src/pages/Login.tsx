import { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { safeDestination } from "@/lib/safeDestination";
import { rememberSignIn } from "@/lib/sessionPersistence";
import { PortalShell, portalField, portalKicker, portalLabel } from "@/components/PortalShell";
import { RequestAccessForm } from "@/components/RequestAccessForm";

type Mode = "signin" | "request";

const copy = {
  signin: { kicker: "Members only", heading: "Sign in to the Training Hub" },
  request: { kicker: "New to the hub", heading: "Request programme access" },
} as const;

/**
 * The hub's front door, and the two things you can do at it.
 *
 * Signing in and asking for an account are one decision, so they are one page
 * with two tabs rather than two URLs — switching used to navigate away and
 * lose the address already typed. /request-access still resolves and opens
 * this page on the second tab.
 */
const Login = ({ initialMode = "signin" }: { initialMode?: Mode }) => {
  const [mode, setMode] = useState<Mode>(initialMode);
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

  /** One of the two doors. Held when it is the open one. */
  const door = (value: Mode, label: string) => (
    <button
      type="button"
      onClick={() => setMode(value)}
      aria-pressed={mode === value}
      className={`flex min-h-[44px] items-center whitespace-nowrap px-3 py-3 text-[12.5px] font-bold tracking-[0.04em] transition-colors sm:px-3.5 ${
        mode === value
          ? "bg-foreground text-background"
          : "text-foreground hover:bg-foreground/[0.07]"
      }`}
    >
      {label}
    </button>
  );

  return (
    <PortalShell>
      <div className="space-y-1.5">
        <span className={portalKicker}>{copy[mode].kicker}</span>
        <h2 className="font-display text-[clamp(26px,6.5vw,34px)] font-extrabold leading-[1.04] tracking-[-0.03em]">
          {copy[mode].heading}
        </h2>
      </div>

      <div className="grid grid-cols-2 divide-x-2 divide-foreground border-2 border-foreground">
        {door("signin", "SIGN IN")}
        {door("request", "REQUEST ACCESS")}
      </div>

      {mode === "signin" ? (
        <form onSubmit={handleLogin} className="space-y-[18px]">
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

          <div className="space-y-2">
            <div className="flex items-baseline justify-between gap-3">
              <Label htmlFor="password" className={portalLabel}>Password</Label>
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
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={portalField}
              required
            />
          </div>

          <div className="flex items-center gap-2.5">
            <Checkbox
              id="keep-signed-in"
              checked={keepSignedIn}
              onCheckedChange={(checked) => setKeepSignedIn(checked === true)}
              className="h-[18px] w-[18px]"
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
      ) : (
        <RequestAccessForm onSignIn={() => setMode("signin")} />
      )}
    </PortalShell>
  );
};

export default Login;
