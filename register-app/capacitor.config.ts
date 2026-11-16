import type { CapacitorConfig } from "@capacitor/cli";

/**
 * The App Store and Google Play builds: the same web app, bundled into a
 * native shell. See "App Store and Google Play" in the README.
 *
 * `appId` is permanent once an app is published — change it to an identifier
 * you own (reverse-DNS of your domain) before the first `cap add`.
 */
const config: CapacitorConfig = {
  appId: "app.theregister",
  appName: "The Register",
  webDir: "dist",
  // The bundled files are served to the web view; nothing is loaded from a
  // remote server, so a release cannot change what code runs after review.
  server: { androidScheme: "https" },
  ios: { contentInset: "never" },
  android: { allowMixedContent: false },
};

export default config;
