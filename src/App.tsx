import { useEffect } from "react";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import Landing from "./pages/Landing";
import Index from "./pages/Index";
import Login from "./pages/Login";
import SpecialtyDetail from "./pages/SpecialtyDetail";
import KeyContacts from "./pages/KeyContacts";
import AdminPanel from "./pages/AdminPanel";
import MyProfile from "./pages/MyProfile";
import CommunityHub from "./pages/CommunityHub";
import NotFound from "./pages/NotFound";
import RequestAccess from "./pages/RequestAccess";
import RegisterDirectory from "./pages/RegisterDirectory";
import RegisterDetail from "./pages/RegisterDetail";
import RegisterAccess from "./pages/RegisterAccess";
import RegisterCheckIn from "./pages/register/CheckIn";
import RegisterFeedback from "./pages/register/Feedback";
import RegisterSignIn from "./pages/register/SignIn";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import { DeaneryProvider } from "./contexts/DeaneryContext";
import { RegisterProvider } from "./contexts/RegisterContext";
import { RegisterLayout } from "./components/register/RegisterLayout";
import { RequireAuth } from "./components/RequireAuth";
import { GdprConsentNotice } from "./components/GdprConsentNotice";

const queryClient = new QueryClient();

/**
 * Keeps cached data in step with the session.
 *
 * Every query is scoped to the signed-in user by RLS, so a sign-in or sign-out has
 * to clear the cache — otherwise the next user of the tab briefly sees the previous
 * user's dashboard, and a signed-out tab keeps rendering stale rows.
 */
function AuthCacheSync() {
  const client = useQueryClient();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        client.clear();
      } else if (event === "SIGNED_IN" || event === "USER_UPDATED") {
        client.invalidateQueries();
      }
    });
    return () => subscription.unsubscribe();
  }, [client]);

  return null;
}

const App = () => (
  // `attribute="class"` is what Tailwind's darkMode: ["class"] reads, and the
  // .dark palette in index.css has been sitting complete and unreachable since
  // the beginning. Defaulting to "system" means nobody has to find the toggle
  // to get the theme their device already asked for.
  <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
      <DeaneryProvider>
        <AuthCacheSync />
        <Toaster />
        <Sonner />
        {/* BASE_URL is "/" locally and "/<repo>/" on GitHub Pages. */}
        <BrowserRouter basename={import.meta.env.BASE_URL}>
          {/* Mounted once rather than per-layout: the registers use their own
              shell, and a notice that only appeared on TraineeHQ pages would
              miss the organisers who live in the register. It renders nothing
              when signed out or already acknowledged. */}
          <GdprConsentNotice />
          <Routes>
            {/* Public */}
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/request-access" element={<RequestAccess />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />

            {/* Signed in */}
            <Route path="/dashboard" element={<RequireAuth><Index /></RequireAuth>} />
            <Route path="/specialty/:id" element={<RequireAuth><SpecialtyDetail /></RequireAuth>} />
            <Route path="/contacts" element={<RequireAuth><KeyContacts /></RequireAuth>} />
            <Route path="/community" element={<RequireAuth><CommunityHub /></RequireAuth>} />
            <Route path="/profile" element={<RequireAuth><MyProfile /></RequireAuth>} />

            {/*
              The two pages a trainee touches. Outside RequireAuth on purpose:
              somebody scanning a QR code at a teaching day has no account, and
              the session id in the link is the whole of their authority. Both
              read through security-definer functions that derive the register
              from that session, so a link opens one teaching day and nothing
              else.
            */}
            <Route path="/registers/checkin" element={<RegisterCheckIn />} />
            {/* The register's own front door. A static segment, so it outranks
                the ":slug" route below rather than being read as a register. */}
            <Route path="/registers/sign-in" element={<RegisterSignIn />} />
            <Route path="/registers/feedback" element={<RegisterFeedback />} />

            {/*
              Teaching registers. Gated on a session only — membership decides
              what is inside, because access is a per-person grant that has
              nothing to do with a TraineeHQ role: a trainee may hold a register
              and an admin may hold none. The sidebar carries a shortcut for
              people who hold one (see AppSidebar), but the route stays open to
              any signed-in user so that the directory — where access is
              requested — is reachable by someone who holds none yet.
            */}
            <Route
              path="/registers"
              element={
                <RequireAuth signInPath="/registers/sign-in">
                  <RegisterProvider>
                    <RegisterLayout />
                  </RegisterProvider>
                </RequireAuth>
              }
            >
              <Route index element={<RegisterDirectory />} />
              <Route path=":slug" element={<RegisterDetail />} />
              <Route path=":slug/access" element={<RegisterAccess />} />
            </Route>

            {/* Admins only */}
            <Route
              path="/admin"
              element={
                <RequireAuth roles={["admin", "super_admin"]}>
                  <AdminPanel />
                </RequireAuth>
              }
            />

            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </DeaneryProvider>
      </TooltipProvider>
    </QueryClientProvider>
  </ThemeProvider>
);

export default App;
