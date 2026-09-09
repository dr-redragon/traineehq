/**
 * What this browser remembers about signing in.
 *
 * The feedback form has to know who is answering, so it can mark that person as
 * having given feedback — the gate a certificate is issued against. The original
 * solved that by letting anybody holding the feedback link read the list of who
 * attended, which is a disclosure the link should not carry: attendance at a
 * teaching day is not something a stray link ought to reveal.
 *
 * Instead the check-in page remembers the attendee id it was given, on that
 * device, and the feedback page reads it back. Somebody who has cleared their
 * data or moved device types the address they signed in with instead — so this
 * is a convenience, never the only way through.
 */

const KEY = "traineehq.register.checkin";

interface Remembered {
  attendeeId: string;
  name: string;
}

type Store = Record<string, Remembered>;

function read(): Store {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Store;
  } catch {
    // A private window, cleared site data, or storage switched off. Losing this
    // costs the trainee one typed address, so it must never break the page.
    return {};
  }
}

export function rememberCheckIn(sessionId: string, entry: Remembered): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...read(), [sessionId]: entry }));
  } catch {
    /* see above */
  }
}

export function recallCheckIn(sessionId: string): Remembered | null {
  return read()[sessionId] ?? null;
}
