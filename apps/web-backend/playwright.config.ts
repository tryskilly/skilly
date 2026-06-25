import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright E2E configuration for Skilly Studio.
 *
 * - Starts the Next.js dev server automatically.
 * - Uses the local emergency-password fallback to authenticate.
 * - Saves authenticated state in e2e/.auth so dashboard tests run fast.
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: "*.e2e.ts",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "list",
  use: {
    baseURL: process.env.STUDIO_BASE_URL ?? "http://localhost:4310",
    trace: "on-first-retry",
  },
  projects: [
    { name: "setup", testMatch: /.*\.setup\.ts/ },
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        storageState: "e2e/.auth/user.json",
      },
      dependencies: ["setup"],
    },
  ],
  webServer: {
    // Force in-memory demo tenant so E2E tests are isolated from local Postgres.
    command: "DATABASE_URL= POSTGRES_URL= bun run dev",
    url: "http://localhost:4310/api/health",
    reuseExistingServer: !process.env.CI,
    stdout: "pipe",
    stderr: "pipe",
  },
});
