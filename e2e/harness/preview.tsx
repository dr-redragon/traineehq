/**
 * A page for looking at the signed-in pages without signing in.
 *
 * Every page worth reviewing in a redesign — the dashboard, a specialty, the
 * discussion boards, the admin panel — sits behind sign-in and reads from
 * Supabase, so none of them can be screenshotted or opened by a reviewer who
 * does not already have an account and a populated deanery. This mounts the
 * real pages against the fixture client (see supabase-fixture.ts), so what you
 * are looking at is the actual component tree with invented rows underneath,
 * not a mock-up drawn to look like it.
 *
 * Pick a page with `?page=`; `?theme=dark` renders the dark ground.
 *
 * Dev-server only, and only under vite.preview.config.ts, which is what
 * supplies the fixture alias. `vite build` builds index.html and nothing else,
 * so none of this reaches a bundle.
 */
// An entry point rather than a module: it mounts and exports nothing.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DeaneryProvider } from "@/contexts/DeaneryContext";
import Index from "@/pages/Index";
import SpecialtyDetail from "@/pages/SpecialtyDetail";
import CommunityHub from "@/pages/CommunityHub";
import KeyContacts from "@/pages/KeyContacts";
import AdminPanel from "@/pages/AdminPanel";
import Landing from "@/pages/Landing";
import "@/index.css";

const params = new URLSearchParams(window.location.search);
const page = params.get("page") ?? "dashboard";

if (params.get("theme") === "dark") document.documentElement.classList.add("dark");

// Retries would sit the page on a spinner if a fixture shape were ever wrong,
// which is the one thing a preview must not do quietly.
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
});

// `?page=` names one of these; the routes below are the real paths, so a link
// followed inside a page lands somewhere real rather than on a blank route.
const PATHS: Record<string, string> = {
  dashboard: "/dashboard",
  specialty: "/specialty/sp-1",
  community: "/community",
  contacts: "/contacts",
  admin: "/admin",
  landing: "/",
};

const start = PATHS[page] ?? PATHS.dashboard;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <DeaneryProvider>
          <MemoryRouter initialEntries={[start]}>
            <Routes>
              <Route path="/dashboard" element={<Index />} />
              <Route path="/specialty/:id" element={<SpecialtyDetail />} />
              <Route path="/community" element={<CommunityHub />} />
              <Route path="/contacts" element={<KeyContacts />} />
              <Route path="/admin" element={<AdminPanel />} />
              <Route path="/" element={<Landing />} />
            </Routes>
          </MemoryRouter>
        </DeaneryProvider>
      </TooltipProvider>
    </QueryClientProvider>
  </StrictMode>,
);
