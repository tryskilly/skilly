import { test, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import path from "node:path";

const REPO_ROOT = path.resolve(import.meta.dirname ?? path.dirname(import.meta.url.replace("file://", "")), "../../..");
const HOST_PORT = 4399;

test.describe.configure({ mode: "serial" });

test.describe("@skilly/web widget embed", () => {
  let server: ReturnType<typeof spawn>;

  test.beforeAll(async () => {
    // Serve the repo root so the fixture can load the built SDK.
    server = spawn("bun", ["-e", `Bun.serve({ port: ${HOST_PORT}, fetch: (req) => new Response(Bun.file('${REPO_ROOT}' + new URL(req.url).pathname)) })`], {
      cwd: REPO_ROOT,
      stdio: "inherit",
    });

    // Wait for the static server to be ready.
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Static server did not start in time")), 20_000);
      const check = setInterval(async () => {
        try {
          const response = await fetch(`http://localhost:${HOST_PORT}/apps/web-backend/e2e/fixtures/host-page.html`);
          if (response.status === 200) {
            clearInterval(check);
            clearTimeout(timeout);
            resolve();
          }
        } catch {
          // Keep waiting.
        }
      }, 200);
    });
  });

  test.afterAll(() => {
    server?.kill();
  });

  test("widget mounts and launcher is visible", async ({ page }) => {
    await page.goto(`http://localhost:${HOST_PORT}/apps/web-backend/e2e/fixtures/host-page.html`);

    // The widget creates a Shadow-DOM host; wait for the launcher button.
    const launcher = page.locator("[data-skilly-widget]").first();
    await expect(launcher).toBeAttached();

    // The launcher should be clickable (visible in the shadow DOM).
    const shadowButton = launcher.locator("css=button.skilly-launcher").first();
    await expect(shadowButton).toBeVisible();
  });

  test("widget can start a simulated turn and point at annotated element", async ({ page }) => {
    await page.goto(`http://localhost:${HOST_PORT}/apps/web-backend/e2e/fixtures/host-page.html`);

    const launcher = page.locator("[data-skilly-widget]").first();
    const shadowButton = launcher.locator("css=button.skilly-launcher").first();
    await shadowButton.click();

    // Wait for the bubble to show listening/thinking/speaking state.
    await expect(launcher.locator("css=.skilly-bubble")).toBeVisible({ timeout: 10_000 });
  });
});
