import type { ReactNode } from "react";
import { RegisterMasthead } from "@/components/register/RegisterMasthead";
import { useRegisterTheme } from "@/hooks/useRegisterTheme";
import { cn } from "@/lib/utils";

/**
 * The page a trainee gets: the register's masthead over a single narrow column.
 *
 * Sign-in, check-in and feedback all live outside the register's shell — the
 * first two are opened by scanning a QR code at a teaching day, by somebody who
 * has no account and may never see another page of this — so they carry the
 * masthead themselves rather than arriving as an unbranded form.
 */
export function RegisterPageShell({
  children,
  className,
  href,
}: {
  children: ReactNode;
  className?: string;
  /** Where the mark goes, for the pages whose visitor is signed in. */
  href?: string;
}) {
  useRegisterTheme();

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <RegisterMasthead href={href} />
      <main className={cn("mx-auto w-full max-w-md flex-1 space-y-4 px-4 py-8", className)}>
        {children}
      </main>
    </div>
  );
}
