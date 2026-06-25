import { test, expect } from "@playwright/test";

test.use({ storageState: "e2e/.auth/user.json" });

test.describe("usage page", () => {
  test("usage page loads with metrics", async ({ page }) => {
    await page.goto("/dashboard/usage");
    await expect(page.getByRole("heading", { name: "Track voice minutes and sessions." })).toBeVisible();
    await expect(page.getByText("Minutes used")).toBeVisible();
    await expect(page.getByText("Sessions", { exact: true })).toBeVisible();
    await expect(page.getByText("Recent events", { exact: true })).toBeVisible();
  });

  test("usage page shows recorded events after session report", async ({ page, request }) => {
    // Report some usage via the web API.
    const report = await request.post("/api/web/usage", {
      headers: {
        "X-Skilly-Key": "pk_test_demolocaldemolocaldemolocal01",
        Origin: "http://localhost:4399",
        "Content-Type": "application/json",
      },
      data: JSON.stringify({ seconds: 42, page: "/projects", domain: "app.acme.com", durationSeconds: 42, result: "completed" }),
    });
    expect(report.status()).toBe(200);

    await page.goto("/dashboard/usage");
    await expect(page.getByRole("cell", { name: "Session seconds" })).toBeVisible();
  });
});
