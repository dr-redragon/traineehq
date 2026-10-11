import { useEffect, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import logoWhite from "@/assets/logo-white.png";
import { PolicyLink } from "@/components/PolicyLink";
import { POLICY_UPDATED } from "@/lib/legal";

export interface LegalSection {
  /** Anchor id, so a section can be linked to: /privacy#cookies. */
  id: string;
  heading: string;
  body: ReactNode;
}

/**
 * The layout the Privacy Policy and Terms of Use share.
 *
 * A reading page, not the sign-in shell: the shell's column is 620px of form
 * and would turn a long document into a scroll inside a scroll. Same ink
 * masthead and wordmark so it is recognisably the same site, then one measure
 * of text with a contents list, because people come to these pages looking
 * for one answer rather than to read them through.
 */
export function LegalPage({
  kicker, title, intro, sections,
}: {
  kicker: string;
  title: string;
  intro: ReactNode;
  sections: LegalSection[];
}) {
  const { hash } = useLocation();

  // ScrollToTop opens every page at its beginning; a link straight to a
  // section (the cookie policy is /privacy#cookies) should land on it.
  useEffect(() => {
    if (!hash) return;
    document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView();
  }, [hash]);

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-ink-900 text-ink-100">
        <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 pb-10 pt-6 sm:px-8">
          <Link to="/" className="flex w-fit items-center gap-3">
            <img src={logoWhite} alt="" className="h-8 w-8" />
            <span className="font-display text-xl font-extrabold tracking-tight">TraineeHQ</span>
          </Link>
          <div className="space-y-2">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-ink-400">{kicker}</p>
            <h1 className="font-display text-[clamp(32px,7vw,52px)] font-extrabold leading-[0.98] tracking-[-0.03em]">
              {title}
            </h1>
            <p className="text-sm text-ink-400">Last updated {POLICY_UPDATED}</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-8">
        <div className="space-y-4 text-pretty text-[15px] leading-relaxed text-muted-foreground">
          {intro}
        </div>

        <nav aria-label="Contents" className="mt-8 border-y-2 border-foreground py-5">
          <p className="mb-3 text-[11.5px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
            Contents
          </p>
          <ol className="list-decimal pl-5 [&>li]:mb-1.5 text-sm sm:columns-2 sm:gap-x-12 [&>li]:break-inside-avoid">
            {sections.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="text-accent-deep underline-offset-4 hover:underline">
                  {s.heading}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="mt-10 space-y-10">
          {sections.map((s, i) => (
            <section key={s.id} id={s.id} aria-labelledby={`${s.id}-h`} className="scroll-mt-6">
              <h2 id={`${s.id}-h`} className="font-display text-2xl font-extrabold tracking-tight">
                <span className="mr-2 text-muted-foreground">{i + 1}.</span>
                {s.heading}
              </h2>
              <div className="legal-body mt-3 space-y-3 text-pretty text-[15px] leading-relaxed text-foreground/90 [&_a]:text-accent-deep [&_a]:underline [&_a]:underline-offset-4 [&_li]:pl-1 [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5 [&_strong]:text-foreground">
                {s.body}
              </div>
            </section>
          ))}
        </div>
      </main>

      <footer className="border-t-2 border-foreground">
        <div className="mx-auto flex max-w-3xl flex-wrap gap-x-[18px] gap-y-1 px-4 py-6 text-[12.5px] sm:px-8">
          <PolicyLink kind="privacy" className="text-accent-deep underline underline-offset-4" />
          <PolicyLink kind="terms" className="text-accent-deep underline underline-offset-4" />
          <Link to="/contact" className="text-accent-deep underline underline-offset-4">Contact us</Link>
          <Link to="/" className="text-accent-deep underline underline-offset-4">Back to sign in</Link>
        </div>
      </footer>
    </div>
  );
}
