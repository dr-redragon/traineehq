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
      <header className="border-b bg-card">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4">
          <Link to="/registers" className="flex items-center gap-2 shrink-0">
            <img src={logoDark} alt="" className="h-7 w-auto" />
            <span className="font-display text-sm font-semibold tracking-tight">
              Teaching registers
            </span>
          </Link>

          {/* The switcher only earns its place once there is a choice to make. */}
          {myRegisters.length > 1 && (
            <Select
              value={activeRegister?.slug ?? undefined}
              onValueChange={setActiveRegisterSlug}
            >
              <SelectTrigger className="ml-2 h-8 w-[240px] text-xs">
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

          <Button asChild variant="ghost" size="sm" className="text-xs">
            <Link to="/dashboard">
              <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
              TraineeHQ
            </Link>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-xs"
            onClick={() => supabase.auth.signOut()}
          >
            <LogOut className="mr-1.5 h-3.5 w-3.5" />
            Sign out
          </Button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <Outlet />
      </main>

      <footer className="border-t py-4">
        <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 text-xs text-muted-foreground">
          <BookOpen className="h-3.5 w-3.5" />
          Attendance registers for specialty teaching programmes.
        </div>
      </footer>
    </div>
  );
}
