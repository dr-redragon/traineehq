import { useEffect, useState, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

type AppRole = "super_admin" | "admin" | "facilitator" | "trainee";

/**
 * Tracks the Supabase session for the current tab.
 *
 * `undefined` means "not resolved yet" — the difference between that and `null`
 * matters, because rendering a redirect before the stored session is read would
 * bounce every signed-in user to the login page on a hard refresh.
 */
function useSession() {
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

function FullPageMessage({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="text-center text-sm text-muted-foreground">{children}</div>
    </div>
  );
}

interface RequireAuthProps {
  children: ReactNode;
  /** When set, the signed-in user must hold one of these roles. */
  roles?: AppRole[];
}

/**
 * Gates a route on an authenticated session, and optionally on a role.
 *
 * This is a usability and defence-in-depth layer, not the security boundary —
 * row-level security in Postgres is what actually withholds data. Its job is to
 * stop signed-out visitors landing on an empty dashboard, and to stop trainees
 * opening an admin screen whose every query would fail.
 */
export function RequireAuth({ children, roles }: RequireAuthProps) {
  const session = useSession();
  const location = useLocation();
  const { data: role, isLoading: roleLoading } = useUserRole();

  if (session === undefined) {
    return <FullPageMessage>Checking your session…</FullPageMessage>;
  }

  if (session === null) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }

  if (roles) {
    if (roleLoading || !role) {
      return <FullPageMessage>Checking your access…</FullPageMessage>;
    }
    if (!roles.includes(role)) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-background p-6">
          <div className="max-w-sm text-center space-y-4">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
              <ShieldAlert className="h-6 w-6 text-destructive" />
            </div>
            <div className="space-y-1.5">
              <h1 className="text-lg font-display font-semibold">You don't have access to this page</h1>
              <p className="text-sm text-muted-foreground">
                This area is for administrators. If you think you should have access, ask your
                training programme administrator to update your role.
              </p>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link to="/dashboard">Back to dashboard</Link>
            </Button>
          </div>
        </div>
      );
    }
  }

  return <>{children}</>;
}
