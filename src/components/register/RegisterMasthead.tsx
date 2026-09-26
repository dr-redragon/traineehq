import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import logoWhite from "@/assets/logo-white.png";

/**
 * The bar every register page opens with: the site's ink rail turned on its
 * side, with an accent rule under it and the name set in the heading face. Its
 * colours are the site's tokens, so it follows the theme and accent scheme.
 *
 * It is shared by the signed-in shell and by the three pages that sit outside
 * it — sign-in, check-in and feedback. A trainee scanning a QR code at a
 * teaching day sees this and nothing else of the register, so it is the whole
 * of the register's identity to them and has to look the part on its own.
 */
export function RegisterMasthead({
  href,
  actions,
  below,
}: {
  /** Where the mark goes. Omitted for the pages an anonymous visitor lands on. */
  href?: string;
  actions?: ReactNode;
  below?: ReactNode;
}) {
  const mark = (
    <>
      <img src={logoWhite} alt="" className="h-9 w-9 shrink-0" />
      <span className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
        <span className="font-display text-2xl font-extrabold leading-none tracking-[-0.02em]">
          The Register
        </span>
        <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-register-deep-muted">
          Teaching attendance
        </span>
      </span>
    </>
  );

  return (
    <header className="border-b-4 border-register-gold bg-register-deep text-register-deep-foreground print:hidden">
      <div className="mx-auto max-w-7xl px-4 py-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          {href ? (
            <Link
              to={href}
              title="Back to TraineeHQ"
              className="flex min-w-0 items-center gap-3 rounded-md transition-opacity hover:opacity-90"
            >
              {mark}
            </Link>
          ) : (
            <span className="flex min-w-0 items-center gap-3">{mark}</span>
          )}

          {actions && (
            <>
              <div className="flex-1" />
              {actions}
            </>
          )}
        </div>
        {below}
      </div>
    </header>
  );
}
