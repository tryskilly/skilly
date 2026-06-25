import { test, expect } from "@playwright/test";

const DEMO_KEY = "pk_test_demolocaldemolocaldemolocal01";
const ALLOWED_ORIGIN = "http://localhost:4399";
const BLOCKED_ORIGIN = "https://evil.example.com";

test.describe("web SDK API", () => {
  test("missing key returns 401", async ({ request }) => {
    const response = await request.post("/api/web/token");
    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body.error).toBeTruthy();
  });

  test("disallowed origin returns 403", async ({ request }) => {
    const response = await request.post("/api/web/token", {
      headers: {
        "X-Skilly-Key": DEMO_KEY,
        Origin: BLOCKED_ORIGIN,
      },
    });
    expect(response.status()).toBe(403);
  });

  test("allowed origin mints a token", async ({ request }) => {
    const response = await request.post("/api/web/token", {
      headers: {
        "X-Skilly-Key": DEMO_KEY,
        Origin: ALLOWED_ORIGIN,
      },
    });
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(typeof body.clientSecret).toBe("string");
    expect(body.clientSecret.length).toBeGreaterThan(0);
  });

  test("skill endpoint serves SKILL.md", async ({ request }) => {
    const response = await request.get("/api/web/skill?skill=default", {
      headers: {
        "X-Skilly-Key": DEMO_KEY,
        Origin: ALLOWED_ORIGIN,
      },
    });
    expect(response.status()).toBe(200);
    const text = await response.text();
    expect(text).toContain("Acme Onboarding");
  });
});
