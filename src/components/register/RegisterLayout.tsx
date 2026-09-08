import { Link, Outlet } from "react-router-dom";
import { ArrowLeft, BookOpen, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useRegister } from "@/contexts/RegisterContext";
import logoDark from "@/assets/logo-dark.png";

/**
 * The register's own shell.
 *
 * Deliberately not `DashboardLayout`: the register is reached by direct link and
 * stands on its own, so it does not borrow TraineeHQ's sidebar. Anyone holding a
 * membership can be here — including a trainee, who has no business in the admin
 * panel — which is exactly why this is a separate route tree rather than a tab
 * inside `/admin`.
 */
export function RegisterLayout() {
  const { activeRegister, myRegisters, setActiveRegisterSlug } = useRegister();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/*
        Two rows on a phone, one on a laptop. The register switcher is the
        widest thing here and the least willing to shrink — a 240px select next
        to a logo and two buttons does not fit 375px — so on small screens it
        drops to its own full-width row instead of being squeezed.
      */}
      <header className="border-b bg-card print:hidden">
        <div className="mx-auto max-w-6xl px-4">
          <div className="flex h-14 items-center gap-2">
            {/* Back to TraineeHQ, not to the register list — the logo is the
                TraineeHQ mark, so it should do what that mark does everywhere
                else. The register list is one click away in the breadcrumbs. */}
            <Link to="/dashboard" className="flex min-w-0 items-center gap-2">
              <img src={logoDark} alt="" className="h-7 w-auto shrink-0" />
              <span className="hidden truncate font-display text-sm font-semibold tracking-tight sm:inline">
                Teaching registers
              </span>
            </Link>

            {myRegisters.length > 1 && (
              <Select
                value={activeRegister?.slug ?? undefined}
                onValueChange={setActiveRegisterSlug}
              >
                <SelectTrigger className="ml-2 hidden h-8 w-[240px] text-xs sm:flex">
                  <SelectValue placeholder="Choose a register" />
                </SelectTrigger>
                <SelectContent>
                  {myRegisters.map((r) => (
                    <SelectItem key={r.slug} value={r.slug} className="text-xs">
                      {r.deanery_name} · {r.specialty_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            <div className="flex-1" />

            {/* Labels collapse to icons on a phone; the icons carry the meaning,
                so each keeps an accessible name. */}
            <Button asChild variant="ghost" size="sm" className="text-xs">
              <Link to="/dashboard" aria-label="Back to TraineeHQ">
                <ArrowLeft className="h-3.5 w-3.5 sm:mr-1.5" />
                <span className="hidden sm:inline">TraineeHQ</span>
              </Link>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs"
              aria-label="Sign out"
              onClick={() => supabase.auth.signOut()}
            >
              <LogOut className="h-3.5 w-3.5 sm:mr-1.5" />
              <span className="hidden sm:inline">Sign out</span>
            </Button>
          </div>

          {myRegisters.length > 1 && (
            <div className="pb-3 sm:hidden">
              <Select
                value={activeRegister?.slug ?? undefined}
                onValueChange={setActiveRegisterSlug}
              >
                <SelectTrigger className="h-9 w-full text-xs">
                  <SelectValue placeholder="Choose a register" />
                </SelectTrigger>
                <SelectContent>
                  {myRegisters.map((r) => (
                    <SelectItem key={r.slug} value={r.slug} className="text-xs">
                      {r.deanery_name} · {r.specialty_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:py-8">
        <Outlet />
      </main>

      <footer className="border-t py-4 print:hidden">
        <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 text-xs text-muted-foreground">
          <BookOpen className="h-3.5 w-3.5" />
          Attendance registers for specialty teaching programmes.
        </div>
      </footer>
    </div>
  );
}
