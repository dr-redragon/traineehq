import { useState } from "react";
import { useLocation } from "react-router-dom";
import { Search } from "lucide-react";

import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { GlobalSearch } from "@/components/GlobalSearch";
import { ThemeToggle } from "@/components/ThemeToggle";

/**
 * Where a page says it is, for the top bar.
 *
 * The design puts a quiet breadcrumb at the end of the bar — "Dashboard",
 * "Specialties / Urology", "Community / Discussion boards". Most of those can
 * be read straight off the path; the one that cannot is a specialty, whose
 * name is only known to the page that loaded it, so that page passes its own.
 */
const CRUMBS: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/contacts": "Key contacts",
  "/community": "Community / Discussion boards",
  "/profile": "Account / My profile",
  "/admin": "Admin panel",
};

function useCrumb(override?: string) {
  const { pathname } = useLocation();
  if (override) return override;
  if (CRUMBS[pathname]) return CRUMBS[pathname];
  if (pathname.startsWith("/specialty/")) return "Specialties";
  return "";
}

export function DashboardLayout({
  children,
  breadcrumb,
}: {
  children: React.ReactNode;
  /** What the top bar should say, when the path alone cannot say it. */
  breadcrumb?: string;
}) {
  const [searchOpen, setSearchOpen] = useState(false);
  const crumb = useCrumb(breadcrumb);

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          {/* 1B leads the page with search rather than the nav: one field over
              the content that reaches every file, folder and thread. It used
              to be a small box inside the rail, which put the widest-reaching
              control in the narrowest column on the page.

              The trigger and the theme toggle are not in the design, but they
              are not decoration either — one collapses the rail on a phone and
              the other is the only way to reach the dark ground. They sit at
              the ends so the field still leads. */}
          <header className="sticky top-0 z-20 flex h-[60px] shrink-0 items-center gap-4 border-b-2 border-border bg-background px-4 sm:px-6">
            <SidebarTrigger className="shrink-0" />
            <button
              onClick={() => setSearchOpen(true)}
              className="flex h-9 min-w-0 flex-1 items-center gap-2 border border-input bg-card px-3 text-sm text-muted-foreground transition-colors hover:border-foreground/45"
            >
              <Search className="h-4 w-4 shrink-0" aria-hidden />
              <span className="truncate text-left">Search every file, folder and thread</span>
            </button>
            <kbd className="hidden shrink-0 text-[12px] tracking-[0.08em] text-muted-foreground sm:inline">⌘K</kbd>
            {crumb && (
              <span className="hidden shrink-0 text-[13px] text-muted-foreground lg:inline">{crumb}</span>
            )}
            <ThemeToggle />
          </header>
          <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} />
          <main className="flex-1 overflow-auto">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
