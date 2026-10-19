import { defineConfig, devices } from "@playwright/test"

/**
 * End-to-end tests run against a running stack, by default the Docker Compose
 * deployment on http://localhost:8080. Override with E2E_BASE_URL, e.g.
 * E2E_BASE_URL=http://localhost:5173 for the Vite dev server.
 */
export default defineConfig({
  testDir: "tests/e2e",
  // The tests share one database, so run them one at a time.
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:8080",
    locale: "en-US",
    // Match the API's APP_TIME_ZONE so "today" means the same day in browser and API.
    timezoneId: "Asia/Shanghai",
    // The app honours reduced motion; it also keeps axe from sampling colours mid-fade.
    contextOptions: { reducedMotion: "reduce" },
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
})
