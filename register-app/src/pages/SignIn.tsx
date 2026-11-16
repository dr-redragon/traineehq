import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Check, Mail } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { RegisterMasthead } from "@/components/register/RegisterMasthead";
import { isConfigured, supabase } from "@/integrations/supabase/client";
import { APP_NAME, PRICE_LABEL, SIGN_IN_PROVIDERS, type SignInProvider } from "@/lib/brand";
import { safeDestination } from "@/lib/safeDestination";
import { DEFAULT_DESTINATION, signInWith } from "@/lib/signIn";

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.07H2.18a11 11 0 0 0 0 9.86l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="currentColor" aria-hidden="true">
      <path d="M17.05 12.54c-.03-2.6 2.12-3.85 2.22-3.91-1.21-1.77-3.09-2.01-3.76-2.04-1.6-.16-3.12.94-3.93.94-.81 0-2.06-.92-3.39-.89-1.74.03-3.35 1.01-4.25 2.57-1.81 3.14-.46 7.79 1.3 10.34.86 1.25 1.89 2.65 3.24 2.6 1.3-.05 1.79-.84 3.36-.84 1.57 0 2.01.84 3.39.81 1.4-.03 2.28-1.27 3.14-2.53.99-1.45 1.4-2.85 1.42-2.92-.03-.01-2.72-1.04-2.74-4.13zM14.47 4.9c.72-.87 1.2-2.07 1.07-3.27-1.03.04-2.28.69-3.02 1.55-.66.77-1.24 2-1.09 3.18 1.15.09 2.32-.58 3.04-1.46z" />
    </svg>
  );
}

const PROVIDERS: Record<SignInProvider, { label: string; icon: JSX.Element; className: string }> = {
  google: {
    label: "Continue with Google",
    icon: <GoogleIcon />,
    className: "border border-input bg-white text-[#1f1f1f] hover:bg-[#f5f5f5]",
  },
  apple: {
    label: "Continue with Apple",
    icon: <AppleIcon />,
    className: "bg-black text-white hover:bg-black/85 dark:border dark:border-white/30",
  },
  azure: {
    label: "Continue with NHSmail",
    icon: <Mail className="h-[18px] w-[18px]" />,
    className: "bg-[#005eb8] text-white hover:bg-[#004f9c]",
  },
};

function PlanColumn({ title, price, points }: { title: string; price: string; points: string[] }) {
  return (
    <div className="border-t-4 border-foreground pt-4">
      <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-accent-deep">{price}</p>
      <h3 className="mt-1 font-display text-xl font-extrabold tracking-tight">{title}</h3>
      <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
        {points.map((p) => (
          <li key={p} className="flex gap-2">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent-deep" /> <span>{p}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The front door: what this is, what it costs, and three ways in.
 *
 * There are no passwords. An account is whatever Google, Apple or NHSmail says
 * you are, which also means an invitation sent to an address finds its person
 * the moment they sign in with it.
 */
export default function SignIn() {
  const navigate = useNavigate();
  const location = useLocation();
  const [busy, setBusy] = useState<SignInProvider | null>(null);

  const destination = safeDestination(
    (location.state as { from?: unknown } | null)?.from,
    DEFAULT_DESTINATION,
  );
  const invited = destination.startsWith("/invite/");

  // Somebody already signed in should not be looking at a sign-in page.
  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (!cancelled && data.session) navigate(destination, { replace: true });
    });
    return () => { cancelled = true; };
  }, [navigate, destination]);

  const start = async (provider: SignInProvider) => {
    setBusy(provider);
    try {
      await signInWith(provider, destination);
      // The browser is leaving for the provider; stay "busy" until it does.
    } catch (error) {
      setBusy(null);
      toast.error(error instanceof Error ? error.message : "Could not start sign-in");
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <RegisterMasthead />

      <main className="mx-auto grid w-full max-w-6xl flex-1 gap-x-16 gap-y-10 px-4 py-10 lg:grid-cols-[1.2fr_1fr] lg:py-16">
        <section className="animate-fade-in">
          <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-accent-deep">
            Attendance, without the spreadsheet
          </p>
          <h1 className="mt-3 font-display text-4xl font-extrabold leading-[0.95] tracking-[-0.03em] sm:text-6xl">
            A register people sign themselves.
          </h1>
          <p className="mt-5 max-w-xl text-base text-muted-foreground">
            Put a QR code on the screen. People check in on their phones, give feedback, and
            get their certificate by email. You get the attendance grid, the report and the
            chase list — and colleagues you invite can run it with you.
          </p>

          <div className="mt-10 grid gap-8 sm:grid-cols-2">
            <PlanColumn
              title="Event register"
              price="Free"
              points={[
                "One conference, course or study day",
                "QR check-in, feedback and certificates",
                "Invite colleagues to help run it",
              ]}
            />
            <PlanColumn
              title="Regular register"
              price={PRICE_LABEL || "Subscription"}
              points={[
                "Teaching that runs all year, every year",
                "Attendance percentages, leave and excusals",
                "Collaborators included — only the owner pays",
              ]}
            />
          </div>
        </section>

        <section className="order-first animate-fade-in lg:order-none lg:pt-8">
          <div className="border-2 border-foreground bg-card p-6 sm:p-8">
            <h2 className="font-display text-2xl font-extrabold tracking-tight">
              {invited ? "Sign in to accept your invitation" : `Sign in to ${APP_NAME}`}
            </h2>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {invited
                ? "Use any of these — it does not have to be the address the invitation was sent to."
                : "No password to remember. New here? The same buttons create your account."}
            </p>

            <div className="mt-6 space-y-3">
              {SIGN_IN_PROVIDERS.map((id) => {
                const p = PROVIDERS[id];
                return (
                  <Button
                    key={id}
                    type="button"
                    disabled={busy !== null || !isConfigured}
                    onClick={() => start(id)}
                    className={`h-12 w-full justify-center gap-3 rounded-none text-[15px] font-semibold ${p.className}`}
                  >
                    {p.icon}
                    {busy === id ? "Opening…" : p.label}
                  </Button>
                );
              })}
            </div>

            {!isConfigured && (
              <p className="mt-4 border-l-4 border-rule pl-3 text-sm">
                This deployment has no Supabase project configured yet. Set
                VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY — see the README.
              </p>
            )}

            <p className="mt-6 text-xs text-muted-foreground">
              NHSmail signs you in with your nhs.net Microsoft account. By continuing you
              agree to the <Link to="/terms" className="underline">terms</Link> and the{" "}
              <Link to="/privacy" className="underline">privacy notice</Link>.
            </p>
          </div>

          <p className="mt-4 text-xs text-muted-foreground">
            Here to check in to a session? You do not need an account — scan the QR code
            on the screen in the room.
          </p>
        </section>
      </main>
    </div>
  );
}
