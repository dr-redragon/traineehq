import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { safeDestination } from "@/lib/safeDestination";
import { ClassicPageShell } from "@/components/classic/ClassicPageShell";

const DEFAULT_DESTINATION = "/classic-registers";

/**
 * The classic register's own front door, re-created from the standalone
 * register's sign-in screen.
 *
 * The one place where the copy could not be literal. The original ran its own
 * accounts, so this screen created a session of its own and the register's
 * administrators added organisers by hand. Here the account IS a TraineeHQ
 * account — that is the requirement the whole exercise is built on — so this
 * signs into TraineeHQ and lands on the register.
 *
 * It exists at all for the reason the live register's version does: an organiser
 * who has only ever used the teaching register, bounced to TraineeHQ's /login,
 * meets a page about curricula and exam preparation and is then dropped on a
 * dashboard rather than the register they were opening.
 */
export default function ClassicSignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const destination = safeDestination(
    (location.state as { from?: unknown } | null)?.from,
    DEFAULT_DESTINATION,
  );

  // Somebody already signed in should not be looking at a sign-in page —
  // reachable with a bookmark in a tab that still holds a session.
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
      toast.error(error.message === "Invalid login credentials"
        ? "Incorrect email or password."
        : error.message);
      return;
    }
    navigate(destination, { replace: true });
  };

  return (
    <ClassicPageShell>
      <form className="card" onSubmit={signIn}>
        <h1>Sign in</h1>
        <p className="lede">
          This register is restricted to its organisers. Trainees checking in or
          giving feedback don't need an account — use the QR code or link for
          your session instead.
        </p>

        <div className="field">
          <label className="fld" htmlFor="classic-email">Email</label>
          <input
            id="classic-email"
            type="email"
            autoComplete="username"
            placeholder="you@example.nhs.uk"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div className="field">
          <label className="fld" htmlFor="classic-password">Password</label>
          <input
            id="classic-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <button type="submit" className="btn primary block" disabled={busy}>
          {busy && <span className="spinner" />}
          {busy ? "Signing in…" : "Sign in"}
        </button>

        <p className="helper" style={{ textAlign: "right" }}>
          <Link to="/forgot-password">Forgot password?</Link>
        </p>
        <p className="helper">
          This is your TraineeHQ account — the same one you use for the rest of
          the site. No account yet? Ask an owner of the register to add you from
          its <strong>Users &amp; access</strong> tab.
        </p>
      </form>
    </ClassicPageShell>
  );
}
