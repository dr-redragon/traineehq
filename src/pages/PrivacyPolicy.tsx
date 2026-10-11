import { Link } from "react-router-dom";
import { LegalPage, type LegalSection } from "@/components/LegalPage";
import { POLICY_CONTROLLER, POLICY_LAWFUL_BASIS } from "@/lib/legal";

/**
 * The privacy policy.
 *
 * Written from the code, not from a template: every category of data below is
 * a table or column in supabase/schema, every recipient is a service an edge
 * function or the page actually calls, and the cookie section is what the
 * browser actually stores. Change the software and this page has to change
 * with it. Controller and lawful basis come from lib/legal.ts.
 */
const sections: LegalSection[] = [
  {
    id: "who-we-are",
    heading: "Who we are",
    body: (
      <>
        <p>
          TraineeHQ (also called the HST Training Hub) is a members-only resource hub for doctors
          in higher specialty training and the people who educate them. The data controller for
          the personal data described in this policy is {POLICY_CONTROLLER}.
        </p>
        <p>
          You can reach us about anything in this policy through the{" "}
          <Link to="/contact">contact form</Link>. Please say that your message is about data
          protection so it reaches the right person.
        </p>
      </>
    ),
  },
  {
    id: "what-we-hold",
    heading: "What we hold about you",
    body: (
      <>
        <p>Depending on how you use TraineeHQ, we hold:</p>
        <ul>
          <li>
            <strong>Account details</strong> — your name, email address, training grade, deanery,
            the specialties you can access and your role (trainee, facilitator or administrator).
          </li>
          <li>
            <strong>Access requests</strong> — what you tell us when you ask for an account or for
            access to another specialty: your name, email address, grade, the specialty and
            deanery you chose and any reason you gave, plus the reviewer&apos;s decision and note.
          </li>
          <li>
            <strong>What you contribute</strong> — discussion posts, comments and votes; files,
            links and notices you add if you help run a specialty; key contacts you add or edit.
          </li>
          <li>
            <strong>Preferences</strong> — bookmarks, starred contacts, watched discussions,
            dashboard layout, light or dark theme and accent colour.
          </li>
          <li>
            <strong>Teaching registers</strong> — if you attend or help run teaching days: sign-ins,
            attendance, absence reasons, feedback and the certificates generated from them.
          </li>
          <li>
            <strong>Security and audit records</strong> — when you sign in, and a log of
            administrative actions such as access decisions and role changes, kept so the site can
            be run securely and changes can be traced.
          </li>
          <li>
            <strong>Messages</strong> — anything you send through the contact form.
          </li>
        </ul>
        <p>
          <strong>Health information.</strong> Teaching registers record why somebody was absent,
          which can include sickness or maternity leave. That is special category data under UK
          GDPR. It is visible only to the people who run that register, and is processed because
          it is necessary for managing attendance in postgraduate training (UK GDPR Article
          9(2)(b) and (h), with the Data Protection Act 2018, Schedule 1).
        </p>
      </>
    ),
  },
  {
    id: "why",
    heading: "Why we use it, and on what basis",
    body: (
      <>
        <p>We use your information to:</p>
        <ul>
          <li>create and secure your account, and decide who can see which specialty;</li>
          <li>show you the resources, contacts, notices and discussions for your specialties;</li>
          <li>record attendance and feedback at teaching days, and issue certificates;</li>
          <li>send you service emails — account approval, password resets, certificates and
            replies to your messages;</li>
          <li>keep the site secure, investigate misuse and keep an audit trail of changes.</li>
        </ul>
        <p>
          Our lawful basis is {POLICY_LAWFUL_BASIS}. We do not rely on your consent, because using
          TraineeHQ is part of how your training is organised and consent would not be freely
          given. You can still object to our processing at any time (see{" "}
          <a href="#your-rights">your rights</a>).
        </p>
        <p>
          We do not use your information for marketing, we do not sell it, and we do not make
          automated decisions about you.
        </p>
      </>
    ),
  },
  {
    id: "who-sees-it",
    heading: "Who can see it",
    body: (
      <>
        <ul>
          <li>
            <strong>Other members</strong> see your name on anything you post, and on a specialty
            you help run if you are listed as a key contact. They never see your email address
            through the discussion boards.
          </li>
          <li>
            <strong>Facilitators</strong> of a specialty see requests to join it and the content in
            it. <strong>Teaching register organisers</strong> see the attendance, absences and
            feedback for their register.
          </li>
          <li>
            <strong>Administrators</strong> for your deanery see account details, access requests
            and the audit log, so they can run the site.
          </li>
        </ul>
        <p>We use the following service providers, who process data only on our instructions:</p>
        <ul>
          <li><strong>Supabase</strong> — database, sign-in and file storage.</li>
          <li><strong>Resend</strong> — sending service emails.</li>
          <li><strong>Our web host</strong> — serving the site&apos;s pages; it sees the
            technical details of each request, such as your IP address.</li>
          <li><strong>Google Fonts</strong> — the site&apos;s typeface is loaded from Google,
            which receives your IP address when the font is fetched.</li>
          <li><strong>YouTube and Vimeo</strong> — only if you play a video embedded from them,
            in which case their own privacy policies apply.</li>
        </ul>
        <p>
          Some of these providers may process data outside the UK. Where they do, the transfer is
          covered by UK adequacy regulations or by the International Data Transfer Agreement or
          Addendum. We will share information with others only where the law requires it.
        </p>
      </>
    ),
  },
  {
    id: "how-long",
    heading: "How long we keep it",
    body: (
      <>
        <ul>
          <li>
            <strong>Your account</strong> and everything personal to it is kept while you have an
            account. When you delete it from your profile page, your login, profile, roles,
            bookmarks, preferences, discussion posts and comments, and teaching register access
            are removed straight away. Files and announcements you added to the shared library
            stay, but are no longer attributed to you.
          </li>
          <li>
            <strong>Access requests</strong> are kept as a record of who was given access and why,
            and are removed on request once they are no longer needed for that purpose.
          </li>
          <li>
            <strong>Teaching register records</strong> are kept for as long as the programme needs
            them to evidence training attendance, after which the register&apos;s organisers
            archive or delete them.
          </li>
          <li>
            <strong>Audit records</strong> are kept for as long as they are needed to keep the
            service secure and to account for changes.
          </li>
          <li>
            <strong>Contact form messages</strong> are kept only as long as it takes to deal with
            them.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "your-rights",
    heading: "Your rights",
    body: (
      <>
        <p>Under UK data protection law you have the right to:</p>
        <ul>
          <li>get a copy of the information we hold about you;</li>
          <li>have inaccurate information corrected;</li>
          <li>have your information deleted;</li>
          <li>restrict or object to how we use it;</li>
          <li>receive it in a portable format.</li>
        </ul>
        <p>
          Much of this you can do yourself on your <Link to="/profile">profile page</Link>: edit
          your details, download your data, or delete your account. For anything else, use
          the <Link to="/contact">contact form</Link>. We will reply within one month.
        </p>
        <p>
          If you are unhappy with how we have handled your information, you can complain to the
          Information Commissioner&apos;s Office at{" "}
          <a href="https://ico.org.uk/make-a-complaint/" target="_blank" rel="noreferrer">
            ico.org.uk
          </a>{" "}
          or on 0303 123 1113. We would appreciate the chance to put things right first.
        </p>
      </>
    ),
  },
  {
    id: "cookies",
    heading: "Cookies and local storage",
    body: (
      <>
        <p>
          TraineeHQ uses <strong>essential storage only</strong>. There is no analytics, no
          advertising and no tracking, so there is nothing to opt in to or out of.
        </p>
        <ul>
          <li>
            <strong>Sign-in session</strong> — kept in your browser&apos;s local storage so you stay
            signed in. Removed when you sign out.
          </li>
          <li>
            <strong>Display preferences</strong> — your light or dark theme and accent colour, so
            the page does not flash the wrong colours while it loads.
          </li>
          <li>
            <strong>Teaching day check-in</strong> — after you sign in at a teaching day, that
            device remembers who you signed in as, so the feedback form knows who is answering.
          </li>
        </ul>
        <p>
          A video you choose to play from YouTube or Vimeo may set that provider&apos;s own
          cookies.
        </p>
      </>
    ),
  },
  {
    id: "security",
    heading: "Keeping it secure",
    body: (
      <p>
        Data travels over encrypted connections. Passwords are stored hashed, never in a form we
        can read. Every table is protected by row-level security, so the database itself — not
        just the website — decides what each person may see. Administrative actions are logged.
      </p>
    ),
  },
  {
    id: "changes",
    heading: "Changes to this policy",
    body: (
      <p>
        If we change how we use your information we will update this page and the date at the
        top. Significant changes will be announced on the dashboard.
      </p>
    ),
  },
];

const PrivacyPolicy = () => (
  <LegalPage
    kicker="Legal"
    title="Privacy Policy"
    intro={
      <p>
        This policy explains what TraineeHQ holds about you, why, who can see it, how long it is
        kept and what you can do about it. It applies to everyone who uses the site — trainees,
        facilitators, administrators, and people who sign in at a teaching day.
      </p>
    }
    sections={sections}
  />
);

export default PrivacyPolicy;
