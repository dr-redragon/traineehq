import type { ReactNode } from "react";
import logoWhite from "@/assets/logo-white.png";
import "@/styles/classic-register.css";
import "@/styles/classic-register-page.css";

/**
 * The shell for the three pages a trainee sees: check-in, feedback, sign-in.
 *
 * These are reached by scanning a QR code at a teaching day, by somebody who has
 * no account and may never see another page of this — so, exactly as in the
 * standalone register, they carry the masthead themselves rather than arriving
 * unbranded, and they wear the roomier public stylesheet rather than the dense
 * one the organiser's tables need.
 */
export function ClassicPageShell({
  children,
  narrow = true,
}: {
  children: ReactNode;
  narrow?: boolean;
}) {
  return (
    <div className="classic-register-page">
      <header className="masthead">
        <div className="masthead-inner">
          <img src={logoWhite} alt="" className="masthead-logo" />
          <span className="mark">The Register</span>
          <span className="sub">Teaching attendance</span>
        </div>
      </header>
      <main className={narrow ? "narrow" : undefined}>{children}</main>
    </div>
  );
}
