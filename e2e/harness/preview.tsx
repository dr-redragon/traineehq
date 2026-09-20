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
// An entry point rather than a module: it mounts and exports nothing. The
// switcher below is a component in a file with no exports, which is exactly
// what react-refresh warns about and exactly what an entry point is.
/* eslint-disable react-refresh/only-export-components */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DeaneryProvider } from "@/contexts/DeaneryContext";
import Index from "@/pages/Index";
import SpecialtyDetail from "@/pages/SpecialtyDetail";
import CommunityHub from "@/pages/CommunityHub";
import SpecialtyDiscussion from "@/pages/SpecialtyDiscussion";
import KeyContacts from "@/pages/KeyContacts";
import MyProfile from "@/pages/MyProfile";
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
  board: "/community/sp-1",
  contacts: "/contacts",
  profile: "/profile",
  admin: "/admin",
  landing: "/",
};

const start = PATHS[page] ?? PATHS.dashboard;

/**
 * A row of page links pinned to the bottom of the preview.
 *
 * The harness is driven by a `?page=` in the address bar, which is fine for a
 * screenshot script and no use at all to somebody being asked to review the
 * work. Pass `&chrome=0` to hide it.
 */
function Switcher() {
  if (params.get("chrome") === "0") return null;
  const theme = params.get("theme") === "dark" ? "dark" : "light";
  const other = theme === "dark" ? "light" : "dark";
  return (
    <div
      style={{
        position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 9999,
        display: "flex", flexWrap: "wrap", alignItems: "center", gap: 4,
        padding: "8px 12px", borderTop: "2px solid #9f9d9d",
        background: "#201e1d", color: "#f3f2f2",
        font: '600 12px/1 Archivo, system-ui, sans-serif', letterSpacing: "0.04em",
      }}
    >
      <span style={{ opacity: 0.55, textTransform: "uppercase", marginRight: 4 }}>Preview</span>
      {Object.keys(PATHS).map((name) => (
        <a
          key={name}
          href={`?page=${name}${theme === "dark" ? "&theme=dark" : ""}`}
          style={{
            padding: "6px 10px", textDecoration: "none", textTransform: "capitalize",
            background: name === page ? "#dd2b0f" : "transparent",
            color: name === page ? "#fff" : "rgba(243,242,242,0.75)",
          }}
        >
          {name}
        </a>
      ))}
      <a
        href={`?page=${page}${other === "dark" ? "&theme=dark" : ""}`}
        style={{
          marginLeft: "auto", padding: "6px 10px", textDecoration: "none",
          border: "1px solid rgba(243,242,242,0.4)", color: "rgba(243,242,242,0.75)",
        }}
      >
        {other === "dark" ? "Dark" : "Light"}
      </a>
    </div>
  );
}

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
              <Route path="/community/:id" element={<SpecialtyDiscussion />} />
              <Route path="/contacts" element={<KeyContacts />} />
              <Route path="/profile" element={<MyProfile />} />
              <Route path="/admin" element={<AdminPanel />} />
              <Route path="/" element={<Landing />} />
            </Routes>
          </MemoryRouter>
          <Switcher />
        </DeaneryProvider>
      </TooltipProvider>
    </QueryClientProvider>
  </StrictMode>,
);
