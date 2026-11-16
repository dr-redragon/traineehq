import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { RegisterMasthead } from "@/components/register/RegisterMasthead";
import { APP_NAME, CONTACT_EMAIL, OPERATOR_NAME } from "@/lib/brand";

/**
 * The privacy notice and the terms.
 *
 * These describe what the software does, accurately, and are written to be
 * read. They are a starting point, not legal advice: whoever operates a
 * deployment is the data controller and must check them against their own
 * circumstances — see "Before you go live" in the README. The operator's name
 * and contact address come from VITE_OPERATOR_NAME and VITE_CONTACT_EMAIL.
 */
const operator = OPERATOR_NAME || `the operator of ${APP_NAME}`;

function Contact() {
  return CONTACT_EMAIL
    ? <a className="underline" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
    : <>the operator of this site</>;
}

function Page({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <RegisterMasthead href="/" />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10">
        <h1 className="font-display text-4xl font-extrabold tracking-[-0.03em]">{title}</h1>
        <div className="mt-8 space-y-6 text-[15px] leading-relaxed [&_h2]:mt-8 [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-extrabold [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-1.5">
          {children}
        </div>
        <p className="mt-12 text-sm text-muted-foreground">
          <Link to="/privacy" className="underline">Privacy</Link> ·{" "}
          <Link to="/terms" className="underline">Terms</Link> ·{" "}
          <Link to="/" className="underline">Sign in</Link>
        </p>
      </main>
    </div>
  );
}

export function Privacy() {
  return (
    <Page title="Privacy notice">
      <p>
        {APP_NAME} is run by {operator}. This notice says what is stored, why, and who can
        see it. Questions and requests go to <Contact />.
      </p>

      <h2>If you run a register</h2>
      <ul>
        <li>Your name and email address, as supplied by Google, Apple or NHSmail when you sign in. No password is ever stored here.</li>
        <li>The registers you create: the people on them, the days, attendance, leave and excusal records, feedback forms and responses.</li>
        <li>If you subscribe: your subscription's status and renewal date. Card details go to Stripe and never reach this service.</li>
        <li>A log of who was given or lost access to a register, and of deletions.</li>
      </ul>
      <p>
        A register is visible to its owners and to the people an owner has invited — nobody
        else. There is no directory of registers and no administrator view of their contents.
      </p>

      <h2>If you attend a session</h2>
      <ul>
        <li>Checking in records your name, your grade or role if asked, and — if you give one — the email address your certificate is sent to.</li>
        <li>The organisers of that register can see this. They decide how long to keep it and are responsible for it; ask them first if you want it corrected or removed.</li>
        <li>Feedback is stored without your name or address. The service records only that you have given feedback, so that a certificate can be released, not which response was yours.</li>
        <li>Your browser remembers your name on your own device to make the next check-in quicker. Nothing else is stored on your device and there are no advertising or analytics cookies.</li>
      </ul>

      <h2>Who processes it</h2>
      <ul>
        <li>Supabase hosts the database and sign-in.</li>
        <li>Stripe takes payments.</li>
        <li>Resend delivers email: invitations, feedback links and certificates.</li>
        <li>Google, Apple or Microsoft confirm who you are when you sign in.</li>
      </ul>

      <h2>Keeping and deleting</h2>
      <ul>
        <li>A deleted register is kept for 15 days so it can be restored, then destroyed along with everything in it.</li>
        <li>Deleting your account, from the Account page, removes your sign-in, cancels any subscription and destroys the registers only you own.</li>
        <li>You can ask for a copy of what is held about you, or for it to be corrected or erased, by writing to <Contact />.</li>
      </ul>
    </Page>
  );
}

export function Terms() {
  return (
    <Page title="Terms of use">
      <p>
        These terms cover your use of {APP_NAME}, run by {operator}. By signing in you agree
        to them.
      </p>

      <h2>What you get</h2>
      <ul>
        <li>Free: event registers, each for a single event such as a conference, course or study day.</li>
        <li>With a subscription: regular registers, for teaching that runs through the year. One subscription covers every regular register you own, and the people you invite to them do not need one.</li>
      </ul>

      <h2>Subscriptions</h2>
      <ul>
        <li>Payment is taken by Stripe and renews until you cancel. You can cancel at any time from the Account page; the subscription then runs to the end of the period already paid for.</li>
        <li>When a subscription ends, the regular registers it covered become read-only. Nothing is deleted: you can still read and export them, and editing returns if you subscribe again.</li>
      </ul>

      <h2>Your responsibilities</h2>
      <ul>
        <li>You are responsible for the registers you create and for the personal data you put in them, including having a proper reason to hold it and telling the people concerned.</li>
        <li>Only invite people who should see a register: everyone you invite can read all of it.</li>
        <li>Do not use the service to record clinical information about patients, or for anything unlawful.</li>
      </ul>

      <h2>The service</h2>
      <ul>
        <li>The service is provided as it is. Reasonable care is taken to keep it available and your data safe, but it comes with no guarantee of uninterrupted availability. Keep your own export of anything you could not afford to lose.</li>
        <li>Accounts that abuse the service — for example, by splitting year-round teaching across event registers to avoid the subscription — may be restricted.</li>
        <li>These terms may change; material changes will be notified to account holders by email.</li>
      </ul>

      <p>Contact: <Contact />.</p>
    </Page>
  );
}
