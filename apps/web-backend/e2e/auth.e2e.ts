import { test, expect } from "@playwright/test";

test.describe("unauthenticated", () => {
  // Ensure these tests run without the saved dashboard session.
  test.use({ storageState: { cookies: [], origins: [] } });

  test("dashboard redirects to login", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForURL(/\/login/);
    await expect(page.getByRole("heading", { name: "Sign in to Skilly" })).toBeVisible();
  });

  test("admin area redirects to login", async ({ page }) => {
    await page.goto("/dashboard/admin/tenants");
    await page.waitForURL(/\/login/);
  });

  test("local password login succeeds", async ({ page }) => {
    await page.goto("/login");
    await page.getByText("Trouble signing in?").click();
    await page.getByLabel("Password").fill("skilly-local");
    await page.getByRole("button", { name: "Sign in with password" }).click();
    await page.waitForURL("/dashboard");
    await expect(page.getByRole("heading", { name: "Is Skilly ready?" })).toBeVisible();
  });
});

test.describe("authenticated", () => {
  test.use({ storageState: "e2e/.auth/user.json" });

  test("dashboard overview loads", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: "Is Skilly ready?" })).toBeVisible();
  });

  test("logout clears session", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: "Is Skilly ready?" })).toBeVisible();

    await page.evaluate(() => {
      const form = document.querySelector('form[action="/api/dashboard/logout"]') as HTMLFormElement | null;
      form?.requestSubmit();
    });
    await page.waitForURL("/login");
    await expect(page.getByRole("heading", { name: "Sign in to Skilly" })).toBeVisible();
  });
});
