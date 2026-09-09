import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ClassicPageShell } from "@/components/classic/ClassicPageShell";
import { checkIn, fetchPublicRoster, fetchPublicSession } from "@/lib/classic/liveApi";
import { GRADES } from "@/lib/classic/constants";
import { rememberCheckIn } from "@/lib/classic/checkInMemory";

const NOT_LISTED = "__not_listed__";

/**
 * The page the QR code opens, re-created from the standalone register's
 * checkin.html.
 *
 * Deliberately anonymous, and outside every auth guard: a trainee standing in a
 * lecture theatre has no TraineeHQ account and should not need one. The session
 * id in the link is the whole of their authority, and the database derives the
 * register from it rather than trusting anything the page sends.
 *
 * It asks for as little as it can — a name from the register's own list, an
 * address only when one is not already on file, and the grade they hold today,
 * which changes between rotations and so belongs to the sign-in rather than to
 * the person.
 */
export default function ClassicCheckIn() {
  const sessionId = new URLSearchParams(window.location.search).get("s") ?? "";

  const [traineeId, setTraineeId] = useState("");
  const [typedName, setTypedName] = useState("");
  const [email, setEmail] = useState("");
  const [grade, setGrade] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<{ name: string; enrolled: boolean } | null>(null);
  const [problem, setProblem] = useState("");

  const session = useQuery({
    queryKey: ["classic-public-session", sessionId],
    queryFn: () => fetchPublicSession(sessionId),
    enabled: !!sessionId,
    retry: false,
  });

  const roster = useQuery({
    queryKey: ["classic-public-roster", sessionId],
    queryFn: () => fetchPublicRoster(sessionId),
    enabled: !!sessionId && !!session.data,
    retry: false,
  });

  const chosen = roster.data?.trainees.find((t) => t.id === traineeId);
  const notListed = traineeId === NOT_LISTED;
  const name = notListed ? typedName.trim() : chosen?.name ?? "";

  // Somebody the register already holds an address for does not type it again;
  // anybody else must, or their certificate has nowhere to go.
  const emailRequired = notListed || (!!chosen && !chosen.has_email);

  useEffect(() => { setProblem(""); }, [traineeId, typedName, email, grade]);

  const submit = async () => {
    if (!name) { setProblem("Choose your name, or add it if it isn't listed."); return; }
    if (emailRequired && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setProblem("A valid email address is needed so your certificate can be sent.");
      return;
    }
    setSubmitting(true);
    try {
      const result = await checkIn({
        sessionId, name, email: email.trim(), grade: grade || undefined,
        localTraineeId: notListed ? null : traineeId || null,
      });
      // Remembered so the feedback form can identify them later without ever
      // showing anybody a list of who attended.
      rememberCheckIn(sessionId, { attendeeId: result.attendee.id, name });
      setDone({ name, enrolled: result.enrolled });
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "Something went wrong — please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!sessionId) {
    return (
      <ClassicPageShell>
        <div className="card">
          <h1>This sign-in link is incomplete</h1>
          <p className="lede">Scan the QR code again, or ask the organiser for a fresh link.</p>
        </div>
      </ClassicPageShell>
    );
  }

  if (session.isLoading) {
    return (
      <ClassicPageShell>
        <div className="card"><div className="lede">Loading the session…</div></div>
      </ClassicPageShell>
    );
  }

  if (session.isError || !session.data) {
    return (
      <ClassicPageShell>
        <div className="card">
          <h1>This sign-in link is not valid any more</h1>
          <p className="lede">
            The teaching day may have been unpublished. Ask the organiser for a
            fresh link.
          </p>
        </div>
      </ClassicPageShell>
    );
  }

  if (done) {
    return (
      <ClassicPageShell>
        <div className="card">
          <div className="done">
            <div className="tick">✓</div>
            <h2>You're signed in</h2>
            <p>{done.name} · {session.data.title}</p>
            {done.enrolled && (
              <p style={{ marginTop: 10 }}>
                You weren't on the register's list, so you've been added — you'll
                be there for future teaching days too.
              </p>
            )}
            <p style={{ marginTop: 10 }}>
              After the session you'll be asked for a short piece of feedback.
            </p>
          </div>
        </div>
      </ClassicPageShell>
    );
  }

  return (
    <ClassicPageShell>
      <div className="card">
        <h1>Sign in</h1>
        <p className="lede session-line">
          {session.data.title}
          <br />
          <span className="session-sub">
            {new Date(session.data.session_date).toLocaleDateString("en-GB", {
              day: "numeric", month: "long", year: "numeric",
            })}
            {session.data.location ? ` · ${session.data.location}` : ""}
          </span>
        </p>

        {problem && <div className="notice bad">{problem}</div>}

        <div className="field">
          <label className="fld" htmlFor="who">Your name</label>
          <select id="who" value={traineeId} onChange={(e) => setTraineeId(e.target.value)}>
            <option value="">{roster.isLoading ? "Loading…" : "Choose your name"}</option>
            {(roster.data?.trainees ?? []).map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
            <option value={NOT_LISTED}>My name is not on the list</option>
          </select>
        </div>

        {notListed && (
          <div className="field">
            <label className="fld" htmlFor="typedName">Your full name</label>
            <input
              id="typedName"
              value={typedName}
              onChange={(e) => setTypedName(e.target.value)}
              placeholder="First and last name"
            />
          </div>
        )}

        {emailRequired && (
          <div className="field">
            <label className="fld" htmlFor="email">Your email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.nhs.uk"
            />
            <p className="helper">Used to send your certificate. Nothing else.</p>
          </div>
        )}

        <div className="field">
          <label className="fld" htmlFor="grade">Your grade this rotation</label>
          <select id="grade" value={grade} onChange={(e) => setGrade(e.target.value)}>
            <option value="">Select grade…</option>
            {GRADES.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>

        <button
          type="button"
          className="btn primary block"
          disabled={submitting}
          onClick={submit}
        >
          {submitting && <span className="spinner" />}
          {submitting ? "Signing in…" : "Sign in"}
        </button>
      </div>
    </ClassicPageShell>
  );
}
