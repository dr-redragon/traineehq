import { supabase } from "@/integrations/supabase/client";
import { isNative, NATIVE_SCHEME } from "@/lib/native";
import { safeDestination } from "@/lib/safeDestination";
import { takeDestination } from "@/lib/signIn";

/**
 * The way back into the native app.
 *
 * Sign-in happens in the system browser. When the provider has finished,
 * Supabase redirects to `<scheme>://auth/callback?code=…`; the operating system
 * hands that address to the app, and this exchanges the code for a session.
 * The exchange only succeeds with the PKCE verifier this install generated
 * before opening the browser, so a code intercepted by another app claiming
 * the same scheme is useless to it.
 *
 * The same listener opens an invitation link (`<scheme>://invite/<token>`),
 * and nothing else: an address the app does not recognise is ignored rather
 * than navigated to.
 */
export async function initNativeAuth(navigate: (path: string) => void) {
  if (!isNative) return;

  const [{ App }, { Browser }] = await Promise.all([
    import("@capacitor/app"), import("@capacitor/browser"),
  ]);

  await App.addListener("appUrlOpen", async ({ url }) => {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return;
    }
    if (parsed.protocol !== `${NATIVE_SCHEME}:`) return;

    // For a custom scheme the "host" is the first path segment.
    const path = `/${parsed.host}${parsed.pathname}`.replace(/\/+$/, "");

    if (path === "/auth/callback") {
      await Browser.close().catch(() => { /* already closed, or Android */ });
      const refused = parsed.searchParams.get("error_description");
      const code = parsed.searchParams.get("code");
      if (refused || !code) {
        navigate(`/auth/callback?error_description=${encodeURIComponent(refused || "Sign-in did not complete.")}`);
        return;
      }
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      navigate(error
        ? `/auth/callback?error_description=${encodeURIComponent(error.message)}`
        : takeDestination());
      return;
    }

    if (/^\/invite\/[A-Za-z0-9]+$/.test(path)) {
      navigate(safeDestination(path, "/registers"));
    }
  });
}
