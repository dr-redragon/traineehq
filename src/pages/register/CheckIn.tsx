import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { RegisterPageShell } from "@/components/register/RegisterPageShell";
import { checkIn, fetchPublicRoster, fetchPublicSession } from "@/lib/register/liveApi";
import { GRADES } from "@/lib/register/constants";
import { rememberCheckIn } from "@/lib/register/checkInMemory";

const NOT_LISTED = "__not_listed__";

/**
 * The page a QR code opens. Deliberately anonymous — a trainee has no account,
 * and the session id in the link is the whole of their authority.
 *
 * It asks for as little as it can: a name from the register's own list, an
 * address only when one is not already on file, and the grade they hold today,
 * which changes between rotations and so is captured per sign-in rather than
 * held on the person.
 */
export default function CheckIn() {
  const sessionId = new URLSearchParams(window.location.search).get("s") ?? "";

  const [traineeId, setTraineeId] = useState("");
  const [typedName, setTypedName] = useState("");
  const [email, setEmail] = useState("");
  const [grade, setGrade] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<
    { name: string; grade: string; email: string; enrolled: boolean } | null
  >(null);
  const [problem, setProblem] = useState("");

  const session = useQuery({
    queryKey: ["public-session", sessionId],
    queryFn: () => fetchPublicSession(sessionId),
    enabled: !!sessionId,
    retry: false,
  });

  const roster = useQuery({
    queryKey: ["public-roster", sessionId],
    queryFn: () => fetchPublicRoster(sessionId),
    enabled: !!sessionId && !!session.data,
    retry: false,
  });

  const chosen = roster.data?.trainees.find((t) => t.id === traineeId);
  const notListed = traineeId === NOT_LISTED;
  const name = notListed ? typedName.trim() : chosen?.name ?? "";

  // Somebody the register already holds an address for does not have to type it
  // again; anybody else does, or their certificate has nowhere to go.
  const emailRequired = notListed || (!!chosen && !chosen.has_email);

  useEffect(() => { setProblem(""); }, [traineeId, typedName, email, grade]);

  if (!sessionId) {
    return <Shell><Message title="This sign-in link is incomplete">
      Scan the QR code again, or ask the organiser for a fresh link.
    </Message></Shell>;
  }

  if (session.isLoading) {
    return <Shell><Skeleton className="h-40 w-full" /></Shell>;
  }

  if (session.isError || !session.data) {
    return <Shell><Message title="This sign-in link is not valid any more">
      The teaching day may have been unpublished. Ask the organiser for a fresh link.
    </Message></Shell>;
  }

  if (done) {
    return (
      <Shell>
        <Card>
          <CardContent className="space-y-4 py-10 text-center">
            <CheckCircle2 className="mx-auto h-12 w-12 text-success" />
            <div className="space-y-1.5">
              <h1 className="font-display text-xl font-bold">You're signed in</h1>
              <p className="text-sm text-muted-foreground">
                {done.name} ({done.grade}) · {session.data.title}
              </p>
            </div>
            <p className="mx-auto max-w-sm text-xs text-muted-foreground">
              After the session you'll get a short feedback form; completing it releases your
              certificate{done.email
                ? ` to ${done.email}`
                : " to the address we hold for you"}.
            </p>
            {done.enrolled && (
              <p className="mx-auto max-w-sm text-xs text-muted-foreground">
                You weren't on the register's list, so you've been added to it — your name will
                be there next time.
              </p>
            )}
          </CardContent>
        </Card>
      </Shell>
    );
  }

  const submit = async () => {
    if (!name) { setProblem("Choose your name, or add it if it isn't listed."); return; }
    // Required, as the original required it: a grade is a fact about this
    // rotation, not about the person, so it is the one thing that has to be
    // asked every time. It is also what goes on their certificate.
    if (!grade) { setProblem("Please choose your grade."); return; }
    // A typed address is always validated, so a typo cannot silently overwrite
    // the one already on file.
    if (email.trim()) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
        setProblem("Please enter a valid email address.");
        return;
      }
    } else if (emailRequired) {
      setProblem("Please enter your email so your certificate can be sent.");
      return;
    }

    setSubmitting(true);
    try {
      const result = await checkIn({
        sessionId, name, email: email.trim(), grade: grade || undefined,
        localTraineeId: notListed ? null : traineeId || null,
      });
      // Remembered so the feedback form can identify them without ever showing
      // anybody a list of who attended.
      rememberCheckIn(sessionId, { attendeeId: result.attendee.id, name });
      setDone({ name, grade, email: email.trim(), enrolled: result.enrolled });
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "Something went wrong — please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Shell>
      <div className="space-y-1">
        <h1 className="font-display text-xl font-bold tracking-tight">
          {session.data.title}
        </h1>
        <p className="text-sm text-muted-foreground">
          {new Date(session.data.session_date).toLocaleDateString("en-GB", {
            day: "numeric", month: "long", year: "numeric",
          })}
          {session.data.location ? ` · ${session.data.location}` : ""}
        </p>
      </div>

      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="space-y-1.5">
            <Label htmlFor="who" className="text-xs">Your name</Label>
            <Select value={traineeId} onValueChange={setTraineeId}>
              <SelectTrigger id="who">
                <SelectValue placeholder={roster.isLoading ? "Loading…" : "Choose your name"} />
              </SelectTrigger>
              <SelectContent>
                {(roster.data?.trainees ?? []).map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
                <SelectItem value={NOT_LISTED}>My name is not on the list</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {notListed && (
            <div className="space-y-1.5">
              <Label htmlFor="typed" className="text-xs">Your full name</Label>
              <Input id="typed" value={typedName} autoFocus
                onChange={(e) => setTypedName(e.target.value)} placeholder="First and last name" />
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="grade" className="text-xs">
              Grade <span className="text-destructive">*</span>{" "}
              <span className="text-muted-foreground">(as of today)</span>
            </Label>
            <Select value={grade} onValueChange={setGrade}>
              <SelectTrigger id="grade"><SelectValue placeholder="Choose" /></SelectTrigger>
              <SelectContent>
                {GRADES.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-xs">
              Email {emailRequired
                ? <span className="text-destructive">*</span>
                : <span className="text-muted-foreground">(we already have one on file)</span>}
            </Label>
            <Input id="email" type="email" inputMode="email" value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={emailRequired ? "you@nhs.net" : "Leave blank to keep the one on file"} />
            <p className="text-[11px] text-muted-foreground">
              Used only to send your certificate. Never shown to other trainees.
            </p>
          </div>

          {problem && <p className="text-sm text-destructive">{problem}</p>}

          <Button className="w-full" onClick={submit} disabled={submitting}>
            {submitting
              ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Signing in…</>
              : "Sign in"}
          </Button>
        </CardContent>
      </Card>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <RegisterPageShell>{children}</RegisterPageShell>;
}

function Message({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="space-y-2 py-10 text-center">
        <h1 className="font-display text-lg font-bold">{title}</h1>
        <p className="mx-auto max-w-sm text-sm text-muted-foreground">{children}</p>
      </CardContent>
    </Card>
  );
}
