import { test, expect } from "@playwright/test";

test.use({ storageState: "e2e/.auth/user.json" });

test.describe("billing page", () => {
  test("billing page loads and shows plan state", async ({ page }) => {
    await page.goto("/dashboard/billing");
    await expect(page.getByRole("heading", { name: "Manage plan and quota." })).toBeVisible();
    await expect(page.getByText("Plan", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /upgrade plan|manage plan/i })).toBeVisible();
  });
});
