import { type ReactNode } from "react";
import { Link } from "react-router-dom";
import logoWhite from "@/assets/logo-white.png";
import { Badge } from "@/components/ui/badge";
import { PolicyLink } from "@/components/PolicyLink";

/**
 * The chrome every public page of the hub shares — signing in, asking for
 * access, getting in touch.
 *
 * One page, three shapes, built from four blocks:
 *
 *   phone    an ink masthead carrying the wordmark and the headline, the
 *            page's own column, a tonal panel holding what the hub contains,
 *            then the footer
 *   tablet   the masthead full-bleed across the top, the column and that
 *            panel side by side beneath it, the footer across the foot
 *   desktop  the Ink Rail split — the masthead and the panel become the one
 *            ink column down the left, the page's column 620px beside it
 *
 * The blocks are written in the phone's reading order and moved into the
 * wider shapes by grid placement, so whatever `children` holds — a form, most
 * of the time — exists once in the document. Rendering it per breakpoint and
 * hiding all but one would put several fields of the same id in the page,
 * which is what the browser autofills into and what a screen reader reads out.
 */

/** Three claims the site already makes on its front page. */
const stats = [
  { value: "30+", label: "Specialties" },
  { value: "24/7", label: "Any device" },
  { value: "GDPR", label: "Compliant" },
];

/** What the hub holds, for the tag row the panel closes on. */
const contents = [
  "Curricula",
  "Exam preparation",
  "Operative videos",
  "Key contacts",
  "Discussion boards",
];

/**
 * A form label in the hub's register: small caps, the way the design sets one.
 * Exported so every form inside the shell is set the same way.
 */
export const portalLabel =
  "text-[11.5px] font-bold uppercase tracking-[0.12em] text-muted-foreground";

/**
 * A field in the hub's register.
 *
 * 16px is not a taste call: iOS zooms the whole page in when it focuses a
 * field set any smaller, and the zoom does not come back out.
 */
export const portalField = "h-11 px-3.5 text-base";

/** The small caps line above a section inside the shell. */
export const portalKicker =
  "block text-xs font-bold uppercase tracking-[0.14em] text-accent-deep";

export function PortalShell({
  children,
  footerLinks,
}: {
  children: ReactNode;
  /** Replaces the default Privacy · Terms · Contact us row. */
  footerLinks?: ReactNode;
}) {
  return (
    <div className="grid min-h-screen grid-cols-1 bg-background md:grid-cols-2 md:grid-rows-[auto_1fr_auto] lg:grid-cols-[minmax(0,1fr)_620px] lg:grid-rows-[1fr_auto_auto]">
      {/* 1 — the masthead, which becomes the head of the ink column. */}
      <header className="flex flex-col gap-5 bg-ink-900 px-6 pb-8 pt-6 text-ink-100 sm:px-8 md:col-span-2 md:row-start-1 lg:col-span-1 lg:col-start-1 lg:row-start-1 lg:justify-between lg:gap-0 lg:p-12 lg:pb-0">
        <Link to="/" className="flex w-fit items-center gap-3">
          <img src={logoWhite} alt="" className="h-8 w-8" />
          <span className="font-display text-xl font-extrabold tracking-tight">TraineeHQ</span>
        </Link>
        <h1 className="max-w-[22ch] text-pretty font-display text-[clamp(32px,8.5vw,62px)] font-extrabold leading-[0.96] tracking-[-0.04em] lg:max-w-[640px] lg:text-[56px] lg:leading-[0.94] lg:tracking-[-0.035em] xl:text-[76px]">
          Everything for your training year, in one place.
        </h1>
      </header>

      {/* 2 — the page's own column. */}
      <section className="flex flex-col md:col-start-1 md:row-start-2 md:border-r-2 md:border-foreground lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:border-r-0">
        <div className="flex flex-1 animate-fade-in flex-col gap-6 px-6 py-8 sm:px-8 lg:gap-7 lg:px-11 lg:py-[52px]">
          {children}
        </div>
      </section>

      {/*
        3 — what the hub holds. A tonal panel under the column on a phone; from
        `lg` it joins the masthead above it into the one ink column, which is
        why its ground and its type both turn at the breakpoint.
      */}
      <section className="flex flex-col gap-6 border-t-2 border-foreground bg-secondary px-6 py-8 sm:px-8 md:col-start-2 md:row-start-2 md:border-t-0 lg:col-start-1 lg:row-span-2 lg:row-start-2 lg:gap-10 lg:border-t-0 lg:bg-ink-900 lg:px-12 lg:pb-12 lg:pt-6 lg:text-ink-100">
        <p className="max-w-[46ch] text-pretty text-[15px] leading-relaxed text-muted-foreground lg:max-w-[480px] lg:text-base lg:text-ink-400">
          Curriculum documents, exam preparation, operative guides and the specialty discussion
          boards — maintained by the training programme.
        </p>

        <dl className="grid grid-cols-1 lg:grid-cols-3 lg:border-t lg:border-ink-100/25">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="flex items-baseline justify-between gap-4 border-t border-border py-3.5 lg:flex-col lg:items-start lg:gap-1.5 lg:border-0 lg:py-0 lg:pr-5 lg:pt-5"
            >
              <dt className="text-[11.5px] uppercase tracking-[0.12em] text-muted-foreground lg:order-last lg:text-ink-500">
                {stat.label}
              </dt>
              <dd className="font-display text-[30px] font-extrabold leading-none tracking-tight lg:text-[34px]">
                {stat.value}
              </dd>
            </div>
          ))}
        </dl>

        <div className="space-y-3 border-t-2 border-foreground pt-4 lg:hidden">
          <span className={portalLabel}>What&apos;s inside</span>
          <div className="mt-3 flex flex-wrap gap-2">
            {contents.map((item) => (
              <Badge key={item} variant="outline">
                {item}
              </Badge>
            ))}
          </div>
        </div>
      </section>

      {/* 4 — the footer, which closes the page on a phone and the column above `lg`. */}
      <footer className="flex flex-col gap-2 border-t-2 border-foreground px-6 py-5 sm:px-8 md:col-span-2 md:row-start-3 lg:col-span-1 lg:col-start-2 lg:row-start-3 lg:gap-1.5 lg:px-11 lg:pb-12 lg:pt-[18px]">
        <p className="text-pretty text-[12.5px] text-muted-foreground">
          Access is restricted to trainees and educators on the training programme. Accounts are
          approved manually.
        </p>
        <div className="flex flex-wrap gap-x-[18px] gap-y-1 text-[12.5px]">
          {footerLinks ?? (
            <>
              <PolicyLink kind="privacy" className="text-accent-deep underline underline-offset-4" />
              <PolicyLink kind="terms" className="text-accent-deep underline underline-offset-4" />
              <Link to="/contact" className="text-accent-deep underline underline-offset-4">
                Contact us
              </Link>
            </>
          )}
        </div>
      </footer>
    </div>
  );
}
