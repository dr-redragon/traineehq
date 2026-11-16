import { Capacitor } from "@capacitor/core";

/**
 * Whether this is the app installed from the App Store or Google Play (the
 * same web app, inside Capacitor's native shell) rather than a browser tab.
 */
export const isNative = Capacitor.isNativePlatform();
export const nativePlatform = Capacitor.getPlatform(); // "ios" | "android" | "web"

/** The custom URL scheme the native app answers to. Must match the native projects. */
export const NATIVE_SCHEME = (import.meta.env.VITE_NATIVE_SCHEME as string | undefined) || "theregister";

/** Where a sign-in provider sends the browser back to. */
export const authRedirectUrl = () =>
  isNative ? `${NATIVE_SCHEME}://auth/callback` : `${window.location.origin}/auth/callback`;

/**
 * The address other people's devices can reach.
 *
 * In a browser that is simply where the page was loaded from. Inside the
 * native app the page's own origin is `capacitor://localhost`, which means
 * nothing to the phone of somebody scanning a QR code or opening an
 * invitation — so the native build must be told the deployed web address
 * (VITE_PUBLIC_URL) and uses it for every link that leaves the device.
 */
export function publicOrigin(): string {
  const configured = (import.meta.env.VITE_PUBLIC_URL as string | undefined)?.replace(/\/+$/, "");
  return configured || window.location.origin;
}

/**
 * Whether this build may offer a subscription for sale.
 *
 * Always on the web. Off in the native apps by default: both stores require
 * digital subscriptions sold inside an app to go through their own billing,
 * and do not allow an app to send people to a website to pay instead. A
 * subscription bought on the web still works in the app — it simply cannot be
 * bought, or advertised, from inside it. Set VITE_NATIVE_PURCHASES=external
 * only for a storefront where linking out is permitted.
 */
export const PURCHASES_ENABLED =
  !isNative || (import.meta.env.VITE_NATIVE_PURCHASES as string | undefined) === "external";
