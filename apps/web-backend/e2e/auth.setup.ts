import { test as setup, expect } from "@playwright/test";
import { fileURLToPath } from "node:url";
import path from "node:path";

const authFile = path.join(path.dirname(fileURLToPath(import.meta.url)), ".auth", "user.json");

/**
 * Authenticate once with the local emergency-password fallback and save the
 * session so dashboard tests can reuse it.
 */
setup("authenticate", async ({ page, request }) => {
  // Reset the in-memory demo tenant so every E2E run starts from a clean seed.
  await request.post("/api/reset-demo");

  await page.goto("/login");

  // Open the emergency-password form.
  await page.getByText("Trouble signing in?").click();

  // Fill and submit the local default password.
  await page.getByLabel("Password").fill("skilly-local");
  await page.getByRole("button", { name: "Sign in with password" }).click();

  // Wait for dashboard to load.
  await page.waitForURL("/dashboard");
  await expect(page.getByText("Is Skilly ready?")).toBeVisible();

  await page.context().storageState({ path: authFile });
});
