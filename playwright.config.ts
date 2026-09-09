import { defineConfig, devices } from "@playwright/test";

// Standalone config. This previously imported `lovable-agent-playwright-config`,
// which is not in package.json, so anything touching Playwright failed to
// resolve it.
//
// The specs here cover what jsdom cannot: gestures, where the browser's own
// handling decides whether a touch becomes a drag or a scroll. Specs set their
// own device with `test.use`, so the single Chromium project below runs both
// desktop and mobile emulation.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:8080",
    trace: "on-first-retry",
    // For sandboxes and CI images that carry their own Chromium rather than the
    // exact build `npx playwright install` would fetch. Unset everywhere else,
    // where Playwright's own browser is the right one.
    ...(process.env.PLAYWRIGHT_CHROMIUM_PATH
      ? { launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } }
      : {}),
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // Build and serve the app unless a base URL is supplied.
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: "npm run dev",
        url: "http://localhost:8080",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
