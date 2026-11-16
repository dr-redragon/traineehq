import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { FullPageMessage } from "@/components/app/RequireAuth";
import { supabase } from "@/integrations/supabase/client";
import { takeDestination } from "@/lib/signIn";

/**
 * Where the provider sends people back to.
 *
 * supabase-js exchanges the `?code=` for a session by itself as the page
 * loads; this page only waits for that to finish, then carries on to wherever
 * the person was going. A provider that refused — consent declined, an account
 * outside the NHS tenant — comes back with `error_description` instead.
 */
export default function AuthCallback() {
  const navigate = useNavigate();
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const refused = params.get("error_description") || hash.get("error_description");
    if (refused) {
      setProblem(refused.replace(/\+/g, " "));
      return;
    }

    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      navigate(takeDestination(), { replace: true });
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) finish();
    });
    supabase.auth.getSession().then(({ data }) => { if (data.session) finish(); });

    // The exchange normally takes well under a second. If nothing has arrived
    // after this long it is not going to.
    const timer = window.setTimeout(() => {
      if (!done) setProblem("Sign-in did not complete. Please try again.");
    }, 12000);

    return () => {
      subscription.unsubscribe();
      window.clearTimeout(timer);
    };
  }, [navigate]);

  if (!problem) return <FullPageMessage>Signing you in…</FullPageMessage>;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="max-w-sm space-y-4 text-center">
        <h1 className="font-display text-xl font-extrabold">We could not sign you in</h1>
        <p className="text-sm text-muted-foreground">{problem}</p>
        <Button asChild><Link to="/">Back to sign in</Link></Button>
      </div>
    </div>
  );
}
