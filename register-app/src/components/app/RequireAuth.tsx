import { useEffect, useState, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

/**
 * The Supabase session for this tab. `undefined` means "not resolved yet" —
 * rendering a redirect before the stored session is read would bounce every
 * signed-in user to the sign-in page on a hard refresh.
 */
export function useSession() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;

    // Subscribe first so a sign-in that lands mid-check is not missed.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => {
      if (!cancelled) setSession(next);
    });

    supabase.auth.getSession().then(({ data }) => {
      if (!cancelled) setSession((current) => (current === undefined ? data.session : current));
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  return session;
}

export function FullPageMessage({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="text-center text-sm text-muted-foreground">{children}</div>
    </div>
  );
}

/**
 * Gates a route on a session. A courtesy, not the security boundary —
 * row-level security is what withholds data. Its job is to send a signed-out
 * visitor to the sign-in page and bring them back to where they were going,
 * which matters most for somebody opening an invitation link.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const session = useSession();
  const location = useLocation();

  if (session === undefined) return <FullPageMessage>Checking your session…</FullPageMessage>;

  if (session === null) {
    return <Navigate to="/" replace state={{ from: location.pathname + location.search }} />;
  }

  return <>{children}</>;
}
