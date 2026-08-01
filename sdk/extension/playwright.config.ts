import { defineConfig } from "@playwright/test";

// testMatch is scoped to tests-e2e/ so these specs stay out of `bun test`'s way and vice versa:
// bun's runner picks up any *.spec.ts / *.test.ts, and would otherwise try to run these
// Playwright specs (which need a real Chromium) as unit tests.
export default defineConfig({
  testDir: "./tests-e2e",
  testMatch: "**/*.spec.ts",
  // MV3 extensions cannot load in a headless context, so these run headed and are slower than
  // unit tests; one retry absorbs the flake that browser startup occasionally introduces.
  retries: 1,
  timeout: 30_000,
  use: {
    trace: "retain-on-failure",
  },
});
