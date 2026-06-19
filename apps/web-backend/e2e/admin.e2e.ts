import { test, expect } from "@playwright/test";

test.use({ storageState: "e2e/.auth/user.json" });

test.describe("admin pages", () => {
  test("tenant directory loads for super admin", async ({ page }) => {
    await page.goto("/dashboard/admin/tenants");
    await expect(page.getByRole("heading", { name: "Tenant directory" })).toBeVisible();
    await expect(page.getByText("Create tenant", { exact: true }).first()).toBeVisible();
  });

  test("super admin can create a tenant", async ({ page }) => {
    await page.goto("/dashboard/admin/tenants");

    const nameInput = page.getByRole("textbox", { name: /tenant name/i });
    await nameInput.fill("E2E Test Tenant");

    // The create-tenant panel is the first cap input (value 0 by default).
    const capInput = page.locator("input[name='capMinutes']").first();
    await capInput.fill("60");

    await page.getByRole("button", { name: /create tenant/i }).click();

    await expect(page.getByText("Created.")).toBeVisible();
    // The tenant name appears twice in the directory card; just assert it shows up.
    await expect(page.getByText("E2E Test Tenant").first()).toBeVisible();
  });
});
