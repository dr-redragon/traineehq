import { describe, it, expect, beforeEach } from "vitest";
import { rememberSignIn, endExpiredSessionOnlyLogin } from "./sessionPersistence";

const TOKEN = "sb-abcdefgh-auth-token";

describe("sessionPersistence", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem(TOKEN, "a-session");
  });

  it("leaves a kept sign-in alone across browser sessions", () => {
    rememberSignIn(true);
    sessionStorage.clear(); // the browser was closed and reopened

    endExpiredSessionOnlyLogin();

    expect(localStorage.getItem(TOKEN)).toBe("a-session");
  });

  it("keeps a session-only sign-in for the browser session that made it", () => {
    rememberSignIn(false);

    endExpiredSessionOnlyLogin();

    expect(localStorage.getItem(TOKEN)).toBe("a-session");
  });

  it("drops a session-only sign-in once the browser session has ended", () => {
    rememberSignIn(false);
    sessionStorage.clear();

    endExpiredSessionOnlyLogin();

    expect(localStorage.getItem(TOKEN)).toBeNull();
  });

  it("drops the chunks Supabase splits a large session into", () => {
    localStorage.setItem(`${TOKEN}.0`, "first-half");
    localStorage.setItem(`${TOKEN}.1`, "second-half");
    rememberSignIn(false);
    sessionStorage.clear();

    endExpiredSessionOnlyLogin();

    expect(localStorage.getItem(`${TOKEN}.0`)).toBeNull();
    expect(localStorage.getItem(`${TOKEN}.1`)).toBeNull();
  });

  it("touches nothing else the app has stored", () => {
    localStorage.setItem("traineehq.theme", "dark");
    rememberSignIn(false);
    sessionStorage.clear();

    endExpiredSessionOnlyLogin();

    expect(localStorage.getItem("traineehq.theme")).toBe("dark");
  });

  it("stops dropping the session once it has done so", () => {
    rememberSignIn(false);
    sessionStorage.clear();
    endExpiredSessionOnlyLogin();

    // A fresh sign-in in this browser session, kept this time.
    localStorage.setItem(TOKEN, "a-new-session");
    endExpiredSessionOnlyLogin();

    expect(localStorage.getItem(TOKEN)).toBe("a-new-session");
  });
});
