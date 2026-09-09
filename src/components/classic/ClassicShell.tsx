import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import logoWhite from "@/assets/logo-white.png";
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
 * The one deliberate departure is the button on the right. The original ends in
 * "Log out", because it had its own accounts. This register is reached through
 * a TraineeHQ sign-in, so logging out here would sign the person out of the
 * whole of TraineeHQ — the wrong thing to offer from a register page. The slot
 * takes them back to the rest of the app instead.
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
  children,
}: {
  subtitle?: string;
  note?: ReactNode;
  tabs?: ClassicTab[];
  activeTab?: string;
  onTabChange?: (id: string) => void;
  homeHref?: string;
  children: ReactNode;
}) {
  return (
    <div className="classic-register">
      <header>
        <div className="masthead-row">
          <Link className="brand" to={homeHref} title="Back to the register home">
            <img src={logoWhite} alt="" className="brand-logo" width={44} height={44} />
            <span className="mark">The Register</span>
            {subtitle && <span className="sub">{subtitle}</span>}
          </Link>
          <span className="row-actions" style={{ gap: 12 }}>
            {note && <span className="cohort-pill">{note}</span>}
            <Link className="btn ghost sm" to="/dashboard">Back to TraineeHQ</Link>
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
