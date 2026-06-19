import { test, expect } from "@playwright/test";

test.use({ storageState: "e2e/.auth/user.json" });

test.describe("settings page", () => {
  test("settings page loads with tenant info", async ({ page }) => {
    await page.goto("/dashboard/settings");
    await expect(page.getByRole("heading", { name: "Workspace administration." })).toBeVisible();
    await expect(page.getByText("Company profile", { exact: true })).toBeVisible();
    await expect(page.getByText("Authentication status", { exact: true })).toBeVisible();
  });
});
