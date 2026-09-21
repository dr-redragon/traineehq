import { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import logoWhite from "@/assets/logo-white.png";
import { Badge } from "@/components/ui/badge";
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
 * Three claims the site already makes on its front page. The phone reads them
 * as a list — label out to the left, figure to the right — and the desktop
 * poster as the value-over-label trio across its foot; same markup, turned by
 * the breakpoint.
 */
const stats = [
  { value: "30+", label: "Specialties" },
  { value: "24/7", label: "Any device" },
  { value: "GDPR", label: "Compliant" },
];

/** What the hub holds, for the tag row the phone layout closes on. */
const contents = [
  "Curricula",
  "Exam preparation",
  "Operative videos",
  "Key contacts",
  "Discussion boards",
];

/**
 * A form label. Small caps on the phone, which is how the design sets one;
 * the desktop column keeps the app's own label so the rest of the forms in
 * the app and this one still match.
 */
const fieldLabel =
  "text-[11.5px] font-bold uppercase tracking-[0.12em] text-muted-foreground " +
  "lg:text-sm lg:font-medium lg:normal-case lg:tracking-normal lg:text-foreground";

/**
 * 16px on the phone is not a taste call: iOS zooms the whole page in when it
 * focuses a field set any smaller, and the zoom does not come back out.
 */
const field = "h-11 px-3.5 text-base lg:text-[15px]";

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

  /*
   * One page, two shapes, one form.
   *
   * On a phone it is the stack the design asks for: an ink masthead, the form,
   * a tonal panel carrying what the hub holds, then the footer. From `lg` it
   * is the Ink Rail split — the masthead and that panel become the one ink
   * column down the left, and the form and footer the 620px column beside it.
   *
   * The four blocks below are written in the phone's reading order and moved
   * into the split by grid placement, so the form exists once. Rendering it
   * twice and hiding one would put two #email fields in the page, which is
   * what browsers autofill into and what screen readers read out.
   */
  return (
    <div className="grid min-h-screen grid-cols-1 bg-background md:grid-cols-2 md:grid-rows-[auto_1fr_auto] lg:grid-cols-[minmax(0,1fr)_620px] lg:grid-rows-[1fr_auto_auto]">
      {/* 1 — the masthead, which becomes the head of the ink column. */}
      <header className="flex flex-col gap-5 bg-ink-900 px-6 pb-8 pt-6 text-ink-100 sm:px-8 md:col-span-2 md:row-start-1 lg:col-span-1 lg:col-start-1 lg:row-start-1 lg:justify-between lg:gap-0 lg:p-12 lg:pb-0">
        <div className="flex items-center gap-3">
          <img src={logoWhite} alt="" className="h-8 w-8" />
          <span className="font-display text-xl font-extrabold tracking-tight">TraineeHQ</span>
        </div>
        <h1 className="max-w-[22ch] text-pretty font-display text-[clamp(32px,8.5vw,62px)] font-extrabold leading-[0.96] tracking-[-0.04em] lg:max-w-[640px] lg:text-[56px] lg:leading-[0.94] lg:tracking-[-0.035em] xl:text-[76px]">
          Everything for your training year, in one place.
        </h1>
      </header>

      {/* 2 — the form. */}
      <section className="flex flex-col md:col-start-1 md:row-start-2 md:border-r-2 md:border-foreground lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:border-r-0">
        {/* The column's own header bar. The phone gets the segmented pair below instead. */}
        <div className="hidden h-[60px] shrink-0 items-center justify-between gap-4 border-b-2 border-border px-11 text-sm text-muted-foreground lg:flex">
          <span className="text-xs font-bold uppercase tracking-[0.12em] text-foreground">
            Sign in
          </span>
          <span>
            Need an account?{" "}
            <Link
              to="/request-access"
              className="font-medium text-accent-deep underline underline-offset-4"
            >
              Request access
            </Link>
          </span>
        </div>

        <div className="flex flex-1 animate-fade-in flex-col gap-6 px-6 py-8 sm:px-8 lg:gap-7 lg:px-11 lg:py-[52px]">
          <div className="space-y-1.5 lg:hidden">
            <span className="block text-xs font-bold uppercase tracking-[0.14em] text-accent-deep">
              Members only
            </span>
            <h2 className="font-display text-[clamp(26px,6.5vw,34px)] font-extrabold leading-[1.04] tracking-[-0.03em]">
              Sign in to the Training Hub
            </h2>
          </div>

          <div className="hidden space-y-2 lg:block">
            <h2 className="font-display text-[38px] font-extrabold leading-[1.05] tracking-[-0.025em]">
              Welcome back
            </h2>
            <p className="text-[14.5px] text-muted-foreground">
              Use the address your account was registered with.
            </p>
          </div>

          {/*
            The two doors, as the design draws them. Requesting access is its
            own page rather than a second mode of this form, so the right half
            is a link out to it and not a tab.
          */}
          <div className="grid grid-cols-2 border-2 border-foreground lg:hidden">
            <span
              aria-current="page"
              className="flex min-h-[44px] items-center whitespace-nowrap px-3 py-3 text-[12.5px] font-bold tracking-[0.04em] sm:px-3.5 bg-foreground text-background"
            >
              SIGN IN
            </span>
            <Link
              to="/request-access"
              className="flex min-h-[44px] items-center whitespace-nowrap px-3 py-3 text-[12.5px] font-bold tracking-[0.04em] sm:px-3.5 border-l-2 border-foreground text-foreground"
            >
              REQUEST ACCESS
            </Link>
          </div>

          <form onSubmit={handleLogin} className="space-y-[18px]">
            <div className="space-y-2">
              <Label htmlFor="email" className={fieldLabel}>
                Email address
              </Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={field}
                required
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-baseline justify-between gap-3">
                <Label htmlFor="password" className={fieldLabel}>
                  Password
                </Label>
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
                className={field}
                required
              />
            </div>

            <div className="flex items-center gap-2.5">
              <Checkbox
                id="keep-signed-in"
                checked={keepSignedIn}
                onCheckedChange={(checked) => setKeepSignedIn(checked === true)}
                className="h-[18px] w-[18px] lg:h-4 lg:w-4"
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
        </div>
      </section>

      {/*
        3 — what the hub holds. A tonal panel under the form on a phone; from
        `lg` it joins the masthead above it into the one ink column, which is
        why its ground and its type both turn at the breakpoint.
      */}
      <section className="flex flex-col gap-6 border-t-2 border-foreground bg-secondary px-6 py-8 sm:px-8 md:col-start-2 md:row-start-2 md:border-t-0 lg:col-start-1 lg:row-span-2 lg:row-start-2 lg:gap-10 lg:border-t-0 lg:bg-ink-900 lg:px-12 lg:pb-12 lg:pt-6 lg:text-ink-100">
        <p className="max-w-[46ch] text-pretty text-[15px] leading-relaxed text-muted-foreground lg:max-w-[480px] lg:text-base lg:text-ink-400">
          Curriculum documents, exam preparation, operative guides and the specialty discussion
          boards — maintained by the training programme.
        </p>

        <dl className="grid grid-cols-1 lg:grid-cols-3 lg:border-t lg:border-ink-100/25">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="flex items-baseline justify-between gap-4 border-t border-border py-3.5 lg:flex-col lg:items-start lg:gap-1.5 lg:border-0 lg:py-0 lg:pr-5 lg:pt-5"
            >
              <dt className="text-[11.5px] uppercase tracking-[0.12em] text-muted-foreground lg:order-last lg:text-ink-500">
                {stat.label}
              </dt>
              <dd className="font-display text-[30px] font-extrabold leading-none tracking-tight lg:text-[34px]">
                {stat.value}
              </dd>
            </div>
          ))}
        </dl>

        <div className="space-y-3 border-t-2 border-foreground pt-4 lg:hidden">
          <span className="block text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
            What's inside
          </span>
          <div className="flex flex-wrap gap-2">
            {contents.map((item) => (
              <Badge key={item} variant="outline">
                {item}
              </Badge>
            ))}
          </div>
        </div>
      </section>

      {/* 4 — the footer, which closes the page on a phone and the form column above `lg`. */}
      <footer className="flex flex-col gap-2 border-t-2 border-foreground px-6 py-5 sm:px-8 md:col-span-2 md:row-start-3 lg:col-span-1 lg:col-start-2 lg:row-start-3 lg:gap-1.5 lg:px-11 lg:pb-12 lg:pt-[18px]">
        <p className="text-pretty text-[12.5px] text-muted-foreground">
          Access is restricted to trainees and educators on the training programme. Accounts are
          approved manually.
        </p>
        <div className="flex gap-[18px] text-[12.5px]">
          <PolicyLink kind="privacy" className="text-accent-deep underline underline-offset-4" />
          <PolicyLink kind="terms" className="text-accent-deep underline underline-offset-4" />
        </div>
      </footer>
    </div>
  );
};

export default Login;
