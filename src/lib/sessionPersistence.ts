/**
 * "Keep me signed in on this device".
 *
 * Supabase keeps the session in localStorage, which survives closing the
 * browser. That is the right default and it is what the checkbox, left
 * ticked, leaves alone — nothing below runs on that path.
 *
 * Cleared, the sign-in is meant to last the browser session only. There is no
 * way to tell the already-created client to use a different store, so the
 * token is dropped instead, the next time the app starts in a browser session
 * that did not perform the sign-in. A sessionStorage marker is what
 * distinguishes the two: it is written alongside the sign-in and is gone once
 * the browser session ends.
 *
 * sessionStorage is per-tab, so opening the app in a second tab counts as a
 * new browser session and asks for the password again. That is the
 * conservative reading of "do not keep me signed in", and the one this
 * checkbox usually carries elsewhere.
 *
 * On a Lovable preview surface the session is brokered to the editor rather
 * than held here (see integrations/supabase/previewAuthStorage), so there is
 * no local token to drop and the checkbox has no effect.
 */

/** Set in localStorage while the current sign-in is session-only. */
const MODE_KEY = "traineehq.session-only";

/** Set in sessionStorage for the life of the browser session that signed in. */
const MARKER_KEY = "traineehq.browser-session";

/** Supabase's own storage key, chunked as `.0`, `.1`… once it outgrows a slot. */
const TOKEN_KEY = /^sb-.+-auth-token(\.\d+)?$/;

/**
 * Records the choice made on the sign-in form. Call it on a successful
 * sign-in, before navigating away.
 */
export function rememberSignIn(keepSignedIn: boolean) {
  try {
    if (keepSignedIn) {
      localStorage.removeItem(MODE_KEY);
      sessionStorage.removeItem(MARKER_KEY);
    } else {
      localStorage.setItem(MODE_KEY, "1");
      sessionStorage.setItem(MARKER_KEY, "1");
    }
  } catch {
    // Storage can be blocked outright (private mode, third-party cookie
    // rules). The default — a persistent session — is what happens then.
  }
}

/**
 * Drops a session-only sign-in left behind by a previous browser session.
 *
 * Runs before anything reads the session, so the app boots signed out rather
 * than signing the visitor in and bouncing them a moment later.
 */
export function endExpiredSessionOnlyLogin() {
  try {
    if (localStorage.getItem(MODE_KEY) !== "1") return;
    if (sessionStorage.getItem(MARKER_KEY) === "1") return;

    for (const key of Object.keys(localStorage)) {
      if (TOKEN_KEY.test(key)) localStorage.removeItem(key);
    }
    localStorage.removeItem(MODE_KEY);
  } catch {
    // As above.
  }
}
