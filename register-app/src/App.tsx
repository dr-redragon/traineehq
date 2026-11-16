import { lazy, Suspense, useEffect } from "react";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { BrowserRouter, Outlet, Route, Routes, useNavigate } from "react-router-dom";
import { initNativeAuth } from "@/lib/nativeAuth";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { RegisterProvider } from "@/contexts/RegisterContext";
import { FullPageMessage, RequireAuth } from "@/components/app/RequireAuth";
import { RegisterLayout } from "@/components/register/RegisterLayout";
import SignIn from "@/pages/SignIn";

const AuthCallback = lazy(() => import("@/pages/AuthCallback"));
const Directory = lazy(() => import("@/pages/Directory"));
const RegisterDetail = lazy(() => import("@/pages/RegisterDetail"));
const Account = lazy(() => import("@/pages/Account"));
const Invite = lazy(() => import("@/pages/Invite"));
const CheckIn = lazy(() => import("@/pages/CheckIn"));
const Feedback = lazy(() => import("@/pages/Feedback"));
const NotFound = lazy(() => import("@/pages/NotFound"));
const Privacy = lazy(() => import("@/pages/Legal").then((m) => ({ default: m.Privacy })));
const Terms = lazy(() => import("@/pages/Legal").then((m) => ({ default: m.Terms })));

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
});

/**
 * Keeps the query cache honest across sign-in and sign-out. Every query is
 * keyed by user id, but clearing on sign-out also drops the previous person's
 * data from memory rather than merely making it unreachable.
 */
function AuthCacheSync() {
  const client = useQueryClient();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") client.clear();
      else if (event === "SIGNED_IN" || event === "USER_UPDATED") client.invalidateQueries();
    });
    return () => subscription.unsubscribe();
  }, [client]);

  return null;
}

/** In the store apps: finishes sign-in when the system browser hands back. */
function NativeLinks() {
  const navigate = useNavigate();
  useEffect(() => {
    void initNativeAuth((path) => navigate(path, { replace: true }));
  }, [navigate]);
  return null;
}

/** Everything behind sign-in shares one shell and one register context. */
function SignedIn() {
  return (
    <RequireAuth>
      <RegisterProvider>
        <RegisterLayout />
      </RegisterProvider>
    </RequireAuth>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AuthCacheSync />
      <Toaster />
      <BrowserRouter>
        <NativeLinks />
        <Suspense fallback={<FullPageMessage>Loading…</FullPageMessage>}>
          <Routes>
            <Route path="/" element={<SignIn />} />
            <Route path="/auth/callback" element={<AuthCallback />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/terms" element={<Terms />} />

            {/*
              The two pages an attendee touches. Outside sign-in on purpose:
              somebody scanning a QR code in a lecture theatre has no account,
              and the session id in the link is the whole of their authority.
              Both read through security-definer functions that derive the
              register from that session, so a link opens one day and nothing
              else. Static segments, so they outrank ":slug" below.
            */}
            <Route path="/registers/checkin" element={<CheckIn />} />
            <Route path="/registers/feedback" element={<Feedback />} />

            <Route element={<SignedIn />}>
              <Route path="/registers" element={<Outlet />}>
                <Route index element={<Directory />} />
                <Route path=":slug" element={<RegisterDetail />} />
              </Route>
              <Route path="/account" element={<Account />} />
              <Route path="/invite/:token" element={<Invite />} />
            </Route>

            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
