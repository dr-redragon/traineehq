import { Link, Outlet } from "react-router-dom";
import { ArrowLeft, BookOpen, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useRegister } from "@/contexts/RegisterContext";
import { useRegisterTheme } from "@/hooks/useRegisterTheme";
import { RegisterMasthead } from "@/components/register/RegisterMasthead";

/**
 * The register's own shell.
 *
 * Deliberately not `DashboardLayout`: the register is reached by direct link and
 * stands on its own, so it does not borrow TraineeHQ's sidebar. Anyone holding a
 * membership can be here — including a trainee, who has no business in the admin
 * panel — which is exactly why this is a separate route tree rather than a tab
 * inside `/admin`.
 *
 * Having its own shell, it wears its own colours too: `useRegisterTheme` swaps
 * the palette to the register's cream-and-moss for as long as one of these
 * pages is up.
 */
export function RegisterLayout() {
  const { activeRegister, myRegisters, setActiveRegisterSlug } = useRegister();
  useRegisterTheme();

  const switcher = (className: string) => (
    <Select value={activeRegister?.slug ?? undefined} onValueChange={setActiveRegisterSlug}>
      <SelectTrigger
        className={`${className} border-white/25 bg-white/10 text-register-deep-foreground focus:ring-register-gold [&>svg]:opacity-70`}
      >
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
  );

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/*
        Two rows on a phone, one on a laptop. The register switcher is the
        widest thing here and the least willing to shrink — a 240px select next
        to a masthead and two buttons does not fit 375px — so on small screens
        it drops to its own full-width row instead of being squeezed.
      */}
      <RegisterMasthead
        /* Back to TraineeHQ, not to the register list — the logo is the
           TraineeHQ mark, so it should do what that mark does everywhere
           else. The register list is one click away in the breadcrumbs. */
        href="/dashboard"
        actions={
          <>
            {myRegisters.length > 1 && (
              <div className="hidden sm:block">{switcher("h-9 w-[240px] text-xs")}</div>
            )}

            {/* Labels collapse to icons on a phone; the icons carry the
                meaning, so each keeps an accessible name. */}
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="text-xs text-register-deep-foreground hover:bg-white/10 hover:text-register-deep-foreground"
            >
              <Link to="/dashboard" aria-label="Back to TraineeHQ">
                <ArrowLeft className="h-3.5 w-3.5 sm:mr-1.5" />
                <span className="hidden sm:inline">TraineeHQ</span>
              </Link>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-register-deep-foreground hover:bg-white/10 hover:text-register-deep-foreground"
              aria-label="Sign out"
              onClick={() => supabase.auth.signOut()}
            >
              <LogOut className="h-3.5 w-3.5 sm:mr-1.5" />
              <span className="hidden sm:inline">Sign out</span>
            </Button>
          </>
        }
        below={
          myRegisters.length > 1 ? (
            <div className="pt-3 sm:hidden">{switcher("h-9 w-full text-xs")}</div>
          ) : null
        }
      />

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
