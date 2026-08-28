import { useEffect } from "react";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
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
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import { DeaneryProvider } from "./contexts/DeaneryContext";
import { RequireAuth } from "./components/RequireAuth";

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
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <DeaneryProvider>
        <AuthCacheSync />
        <Toaster />
        <Sonner />
        <BrowserRouter>
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
);

export default App;
