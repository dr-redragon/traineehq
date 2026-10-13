import { Link } from "react-router-dom";
import { LegalPage, type LegalSection } from "@/components/LegalPage";
import { PolicyLink } from "@/components/PolicyLink";
import { POLICY_CONTROLLER } from "@/lib/legal";

const sections: LegalSection[] = [
  {
    id: "about",
    heading: "About these terms",
    body: (
      <>
        <p>
          TraineeHQ is run by {POLICY_CONTROLLER}. By signing in or using
          the site you agree to these terms. If you do not agree, please do not use it.
        </p>
        <p>
          How we handle your personal information is set out separately in our{" "}
          <PolicyLink kind="privacy" />.
        </p>
      </>
    ),
  },
  {
    id: "accounts",
    heading: "Who can use TraineeHQ",
    body: (
      <ul>
        <li>
          Accounts are for trainees and educators on the training programmes TraineeHQ serves, and
          are approved by hand. We may decline or withdraw access, for example when you leave the
          programme.
        </li>
        <li>
          Your account is for you alone. Keep your password private, and{" "}
          <Link to="/contact">tell us</Link> straight away if you think someone else has used it.
        </li>
        <li>
          Keep your details accurate. Access to a specialty is granted for your training; ask for
          another one from your profile page rather than using somebody else&apos;s account.
        </li>
      </ul>
    ),
  },
  {
    id: "acceptable-use",
    heading: "Acceptable use",
    body: (
      <>
        <p>When you use TraineeHQ you must not:</p>
        <ul>
          <li>
            post or upload <strong>patient-identifiable information</strong> — names, dates of
            birth, NHS or hospital numbers, images or anything else from which a patient could be
            identified;
          </li>
          <li>post anything unlawful, defamatory, discriminatory, harassing or offensive;</li>
          <li>upload material you do not have the right to share, such as copyrighted exam
            papers, paid course content or someone else&apos;s work without permission;</li>
          <li>upload malware, or try to get into accounts, data or parts of the site you have not
            been given access to;</li>
          <li>copy content out of TraineeHQ in bulk, or share it outside the programme where the
            person who added it has not said that you may.</li>
        </ul>
        <p>
          Behave as you would in any professional setting: the GMC&apos;s guidance on the use of
          social media and on confidentiality applies here as it does anywhere else.
        </p>
      </>
    ),
  },
  {
    id: "content",
    heading: "Content you add",
    body: (
      <>
        <p>
          You keep any rights you have in what you post or upload. You give the programme
          permission to host it, show it to the members who can see that specialty, and keep it
          after you leave where it forms part of the shared library.
        </p>
        <p>
          Facilitators and administrators may edit, move or remove content that breaks these terms
          or is out of date, and may suspend accounts that repeatedly break them.
        </p>
      </>
    ),
  },
  {
    id: "clinical",
    heading: "Educational use only",
    body: (
      <p>
        Resources on TraineeHQ are shared for education and training. They are{" "}
        <strong>not clinical guidance</strong> and do not replace local protocols, national
        guidelines, your supervisors&apos; advice or your own professional judgement. Material
        is added by members and may be incomplete or out of date — always check the original
        source before relying on it in practice.
      </p>
    ),
  },
  {
    id: "registers",
    heading: "Teaching registers and certificates",
    body: (
      <p>
        Attendance you record at a teaching day must be your own. Signing in for somebody else, or
        recording attendance that did not happen, is a probity matter and may be reported to your
        programme. Certificates reflect the register as kept by its organisers.
      </p>
    ),
  },
  {
    id: "availability",
    heading: "Availability and liability",
    body: (
      <>
        <p>
          We aim to keep TraineeHQ available and accurate, but it is provided as it is, without
          guarantees. It may be unavailable at times for maintenance or for reasons outside our
          control, and features may change.
        </p>
        <p>
          As far as the law allows, we are not liable for any loss arising from use of the site or
          from relying on its content. Nothing in these terms limits liability that cannot be
          limited by law.
        </p>
      </>
    ),
  },
  {
    id: "ending",
    heading: "Ending your use",
    body: (
      <p>
        You can stop using TraineeHQ at any time and delete your account from your{" "}
        <Link to="/profile">profile page</Link>. We may suspend or close accounts that break these
        terms or that no longer belong to someone on the programme.
      </p>
    ),
  },
  {
    id: "changes",
    heading: "Changes and governing law",
    body: (
      <>
        <p>
          We may update these terms; the date at the top shows when they last changed. Continuing
          to use TraineeHQ after a change means you accept the updated terms.
        </p>
        <p>These terms are governed by the law of England and Wales.</p>
        <p>
          Questions about them? Use the <Link to="/contact">contact form</Link>.
        </p>
      </>
    ),
  },
];

const TermsOfUse = () => (
  <LegalPage
    kicker="Legal"
    title="Terms of Use"
    intro={
      <p>
        These terms cover using TraineeHQ: who may have an account, what you may post, and what
        you can expect from us. They are short on purpose — please read them.
      </p>
    }
    sections={sections}
  />
);

export default TermsOfUse;
