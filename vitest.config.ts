import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          include: ["tests/unit/**/*.test.ts"],
        },
      },
      {
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          // Starts a disposable PostgreSQL container unless TEST_DATABASE_URL is set.
          globalSetup: ["tests/integration/global-setup.ts"],
          // Test files share one database and reset it in beforeEach.
          fileParallelism: false,
          hookTimeout: 120_000,
          testTimeout: 30_000,
        },
      },
    ],
  },
})
