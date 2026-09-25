import type { ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import logoWhite from "@/assets/logo-white.png";
import type { RegisterDirectoryEntry } from "@/lib/classic/types";
import "@/styles/classic-register.css";

export interface ClassicTab {
  id: string;
  label: string;
}

/**
 * The classic register's chrome: masthead, gold rule, sticky tab bar.
 *
 * A faithful re-creation of the standalone ENT register's shell, down to the
 * markup — `.masthead-row`, `.brand`, `.tabs`, `.panel` — because the stylesheet
 * it wears is that register's stylesheet, scoped. Nothing here is a shadcn
 * component; the original had none, and a Radix dialog rendered through a portal
 * would land outside `.classic-register` and lose the palette entirely.
 *
 * The right-hand side carries what the live teaching register's shell does: a
 * switcher between the registers this person holds, the way back to TraineeHQ,
 * and Sign out. Signing out ends the TraineeHQ session — the account is the
 * same one — and lands on the register's own sign-in page.
 */
export function ClassicShell({
  /** The line under "The Register" — the register's own name. */
  subtitle,
  /** The muted line on the right, as the cohort pill was used originally. */
  note,
  tabs,
  activeTab,
  onTabChange,
  /** Where the mark goes. Omitted on pages with nowhere sensible to return to. */
  homeHref = "/classic-registers",
  /** The registers to offer in the switcher; it shows once there are two. */
  registers,
  /** The register on screen, if any. */
  currentSlug,
  children,
}: {
  subtitle?: string;
  note?: ReactNode;
  tabs?: ClassicTab[];
  activeTab?: string;
  onTabChange?: (id: string) => void;
  homeHref?: string;
  registers?: RegisterDirectoryEntry[];
  currentSlug?: string;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const { search } = useLocation();
  const mine = (registers ?? []).filter((r) => r.i_am_member);

  // Switching register opens it on the same tab; the year and teaching day
  // belong to the register being left, so they stay behind.
  const switchTo = (slug: string) => {
    if (!slug || slug === currentSlug) return;
    const tab = new URLSearchParams(search).get("tab");
    navigate(`/classic-registers/${slug}${tab ? `?tab=${encodeURIComponent(tab)}` : ""}`);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate("/classic-registers/sign-in", { replace: true });
  };

  return (
    <div className="classic-register">
      <header>
        <div className="masthead-row">
          <Link className="brand" to={homeHref} title="Back to the register home">
            <img src={logoWhite} alt="" className="brand-logo" width={44} height={44} />
            <span className="mark">The Register</span>
            {subtitle && <span className="sub">{subtitle}</span>}
          </Link>
          <span className="row-actions shell-actions">
            {note && <span className="cohort-pill">{note}</span>}
            {mine.length > 1 && (
              <select
                className="register-switch"
                aria-label="Switch register"
                value={currentSlug ?? ""}
                onChange={(e) => switchTo(e.target.value)}
              >
                {!currentSlug && <option value="">Switch register…</option>}
                {mine.map((r) => (
                  <option key={r.slug} value={r.slug}>
                    {r.deanery_name} · {r.specialty_name}
                  </option>
                ))}
              </select>
            )}
            <Link className="btn ghost sm on-dark" to="/dashboard">Back to TraineeHQ</Link>
            <button type="button" className="btn ghost sm on-dark" onClick={signOut}>
              Sign out
            </button>
          </span>
        </div>
      </header>

      {tabs && tabs.length > 0 && (
        <nav>
          <div className="tabs">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={"tab" + (tab.id === activeTab ? " active" : "")}
                // The original marked the current tab with a colour and an
                // underline alone. State a screen reader can reach costs
                // nothing and does not change how it looks.
                aria-pressed={tab.id === activeTab}
                onClick={() => onTabChange?.(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </nav>
      )}

      <main>{children}</main>
    </div>
  );
}
