import { lazy, useEffect } from "react";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { DeaneryProvider } from "./contexts/DeaneryContext";
import { RegisterProvider } from "./contexts/RegisterContext";
import { RequireAuth } from "./components/RequireAuth";
import { RouteChunk } from "./components/RouteChunk";
import { GdprConsentNotice } from "./components/GdprConsentNotice";
import { ScrollToTop } from "./components/ScrollToTop";
import { ColorSchemeSync } from "./hooks/useColorScheme";
import { ThemeProvider } from "./hooks/useTheme";

/*
 * The pages are loaded when they are opened.
 *
 * One bundle used to hold all of them, so the sign-in screen downloaded and
 * parsed the admin panel, both teaching registers, the drag-and-drop file
 * browser and the PDF, zip and QR libraries that only the certificates use:
 * 1.4MB of JavaScript to render a form with two fields, and the same 1.4MB
 * again before the dashboard could ask for its first row. Route by route, a
 * page costs what that page costs, and the rest arrives while it is being
 * read.
 *
 * Login is the exception, imported directly: it is the first thing a signed-out
 * visitor sees — the site opens on it — and putting it behind a second request
 * would trade the saving straight back. Landing is lazy along with the rest now
 * that it no longer holds the front door.
 */
import Login from "./pages/Login";

const Landing = lazy(() => import("./pages/Landing"));
const Index = lazy(() => import("./pages/Index"));
const SpecialtyDetail = lazy(() => import("./pages/SpecialtyDetail"));
const KeyContacts = lazy(() => import("./pages/KeyContacts"));
const AdminPanel = lazy(() => import("./pages/AdminPanel"));
const MyProfile = lazy(() => import("./pages/MyProfile"));
const CommunityHub = lazy(() => import("./pages/CommunityHub"));
const SpecialtyDiscussion = lazy(() => import("./pages/SpecialtyDiscussion"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Contact = lazy(() => import("./pages/Contact"));
const RegisterDirectory = lazy(() => import("./pages/RegisterDirectory"));
const RegisterDetail = lazy(() => import("./pages/RegisterDetail"));
const RegisterAccess = lazy(() => import("./pages/RegisterAccess"));
const RegisterCheckIn = lazy(() => import("./pages/register/CheckIn"));
const RegisterFeedback = lazy(() => import("./pages/register/Feedback"));
const RegisterSignIn = lazy(() => import("./pages/register/SignIn"));
const ClassicDirectory = lazy(() => import("./pages/classic/Directory"));
const ClassicRegisterDetail = lazy(() => import("./pages/classic/RegisterDetail"));
const ClassicCheckIn = lazy(() => import("./pages/classic/CheckIn"));
const ClassicFeedback = lazy(() => import("./pages/classic/Feedback"));
const ClassicSignIn = lazy(() => import("./pages/classic/SignIn"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const RegisterLayout = lazy(() =>
  import("./components/register/RegisterLayout").then((m) => ({ default: m.RegisterLayout })),
);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      /**
       * Every query used to be stale the moment it resolved, so moving between
       * the dashboard, a specialty and back re-fetched the lot each time and
       * each page opened on empty widgets again. Half a minute is short enough
       * that an edit made in another tab shows up on the next visit, and long
       * enough that ordinary navigation is instant.
       */
      staleTime: 30_000,
      retry: 1,
    },
  },
});

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

/**
 * Sends /register to /registers, keeping whatever follows.
 *
 * The register's routes are all plural, but the singular is the natural thing
 * to type and to write on a handout, so it used to land on the 404 page. The
 * path is rewritten rather than duplicated, so there is still exactly one real
 * URL for any given page and no two copies to keep in step.
 *
 * The query string has to survive: a QR code's check-in link carries the
 * session id in ?s=, and that id is the whole of an anonymous trainee's
 * authority. Dropping it would turn a scanned code into a dead end.
 */
function RegisterAliasRedirect() {
  const { pathname, search, hash } = useLocation();
  return <Navigate to={pathname.replace(/^\/register(?=\/|$)/, "/registers") + search + hash} replace />;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    {/* Inside the query client, because the light/dark choice is read from the
        signed-in person's profile rather than from this browser. It puts the
        `dark` class on <html>, which is what Tailwind's darkMode: ["class"]
        reads. */}
    <ThemeProvider>
      <TooltipProvider>
      <DeaneryProvider>
        <AuthCacheSync />
        {/* The reader's accent scheme, read from their profile and put on
            <html>. At the root because it has to apply on every page, not
            just the one with the picker on it. */}
        <ColorSchemeSync />
        <Toaster />
        <Sonner />
        {/* BASE_URL is "/" locally and "/<repo>/" on GitHub Pages. */}
        <BrowserRouter basename={import.meta.env.BASE_URL}>
          {/* Mounted once rather than per-layout: the registers use their own
              shell, and a notice that only appeared on TraineeHQ pages would
              miss the organisers who live in the register. It renders nothing
              when signed out or already acknowledged. */}
          <GdprConsentNotice />
          {/* Every page opens at its own beginning. Following a link from
              halfway down one page used to land you halfway down the next. */}
          <ScrollToTop />
          {/* One boundary around the lot rather than one per route: the
              fallback is a full-page line either way, and a chunk that fails
              to load needs the same answer wherever it was going. */}
          <RouteChunk>
          <Routes>
            {/* Public */}
            {/*
              The site opens on the sign-in page.

              It used to open on Landing — a separate page carrying its own
              sign-in card — so the redesigned sign-in page was only ever
              reached by typing /login, and everyone arriving at the domain
              went on seeing the old one. This is a members-only tool that is
              not indexed and whose accounts are approved by hand, so the door
              is what the front page is for.

              Landing keeps a path of its own rather than being deleted: it
              still carries the feature summary and the contact form, which is
              the only way to reach anybody from outside.
            */}
            <Route path="/" element={<Login />} />
            <Route path="/login" element={<Login />} />
            <Route path="/welcome" element={<Landing />} />
            {/*
              Requesting access is a tab on the sign-in page, not a page. This
              path still resolves — it is in old emails and links — and opens
              that page on the second tab.
            */}
            <Route path="/request-access" element={<Login initialMode="request" />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />

            {/* Signed in */}
            <Route path="/dashboard" element={<RequireAuth><Index /></RequireAuth>} />
            <Route path="/specialty/:id" element={<RequireAuth><SpecialtyDetail /></RequireAuth>} />
            <Route path="/contacts" element={<RequireAuth><KeyContacts /></RequireAuth>} />
            <Route path="/community" element={<RequireAuth><CommunityHub /></RequireAuth>} />
            {/* A specialty's board, on its own address so it can be linked and
                bookmarked rather than reached by scrolling past the files. */}
            <Route path="/community/:id" element={<RequireAuth><SpecialtyDiscussion /></RequireAuth>} />
            <Route path="/profile" element={<RequireAuth><MyProfile /></RequireAuth>} />

            {/*
              The two pages a trainee touches. Outside RequireAuth on purpose:
              somebody scanning a QR code at a teaching day has no account, and
              the session id in the link is the whole of their authority. Both
              read through security-definer functions that derive the register
              from that session, so a link opens one teaching day and nothing
              else.
            */}
            {/* Singular alias. Declared before the plural routes purely for
                readability; the paths do not overlap. */}
            <Route path="/register" element={<RegisterAliasRedirect />} />
            <Route path="/register/*" element={<RegisterAliasRedirect />} />

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

            {/*
              THE CLASSIC REGISTER — a second teaching register, running beside
              the one above so the two can be compared before one is kept.

              It is a copy of the standalone ENT register at
              register.traineehq.com: its own look, its own six tabs, its own
              classic_* tables, its own sidebar link. Nothing here shares state
              with /registers, so deleting either is a self-contained job.

              Reached the same two ways the first one is: this standalone link,
              or the sidebar. Access is a TraineeHQ sign-in either way — the
              register has no accounts of its own.
            */}
            {/* Public, for the same reason /registers/checkin is: the person
                scanning the QR code at a teaching day has no account, and the
                session id in the link is the whole of their authority. */}
            <Route path="/classic-registers/checkin" element={<ClassicCheckIn />} />
            <Route path="/classic-registers/feedback" element={<ClassicFeedback />} />
            {/* Static, so it outranks the ":slug" route rather than being read
                as the slug of a register. */}
            <Route path="/classic-registers/sign-in" element={<ClassicSignIn />} />

            <Route
              path="/classic-registers"
              element={
                <RequireAuth signInPath="/classic-registers/sign-in">
                  <ClassicDirectory />
                </RequireAuth>
              }
            />
            <Route
              path="/classic-registers/:slug"
              element={
                <RequireAuth signInPath="/classic-registers/sign-in">
                  <ClassicRegisterDetail />
                </RequireAuth>
              }
            />

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
          </RouteChunk>
        </BrowserRouter>
      </DeaneryProvider>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
