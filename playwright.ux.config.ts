import { defineConfig, devices } from "@playwright/test"

import baseConfig from "./playwright.config"

export default defineConfig({
  ...baseConfig,
  testMatch: /.*-ux\.spec\.ts/,
  use: {
    ...baseConfig.use,
    baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:5173",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        channel: process.env.PLAYWRIGHT_CHANNEL,
      },
    },
  ],
  webServer: {
    command:
      "bun run --cwd apps/web dev --host 127.0.0.1 --port 5173 --strictPort",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
})
