#!/usr/bin/env bun
/**
 * Production smoke test for Skilly Studio.
 *
 * Usage:
 *   bun run scripts/production-smoke.ts https://studio.tryskilly.app
 *
 * Optional env:
 *   TEST_PUBLISHABLE_KEY   - a real key to test allowed-origin minting
 *   TEST_ALLOWED_ORIGIN    - an origin in the tenant allowlist
 *   TEST_BLOCKED_ORIGIN    - an origin NOT in the tenant allowlist (defaults to https://evil.example.com)
 */

const baseUrl = process.argv[2] ?? process.env.STUDIO_BASE_URL;
if (!baseUrl) {
  console.error("Usage: bun run scripts/production-smoke.ts <base-url>");
  process.exit(1);
}

const testKey = process.env.TEST_PUBLISHABLE_KEY ?? "";
const allowedOrigin = process.env.TEST_ALLOWED_ORIGIN ?? "";
const blockedOrigin = process.env.TEST_BLOCKED_ORIGIN ?? "https://evil.example.com";

const results: { name: string; ok: boolean; detail?: string }[] = [];

function assert(name: string, ok: boolean, detail?: string) {
  results.push({ name, ok, detail });
  const icon = ok ? "✓" : "✗";
  console.log(`${icon} ${name}${detail ? ` — ${detail}` : ""}`);
}

async function request(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${baseUrl}${path}`, init);
}

async function run() {
  console.log(`Smoking testing ${baseUrl}\n`);

  // 1. Health check
  const health = await request("/api/health");
  const healthBody = await health.json().catch(() => ({}));
  assert(
    "Health endpoint returns 200 and ok=true",
    health.status === 200 && healthBody.ok === true && healthBody.service === "skilly-web-backend",
    `status=${health.status}, ok=${healthBody.ok}`,
  );

  // 2. Unauthenticated dashboard redirect
  const dashboard = await request("/dashboard", { redirect: "manual" });
  const dashboardRedirectStatus = dashboard.status === 302 || dashboard.status === 307;
  assert(
    "Dashboard redirects unauthenticated users to /login",
    dashboardRedirectStatus && dashboard.headers.get("location")?.startsWith("/login"),
    `status=${dashboard.status}, location=${dashboard.headers.get("location")}`,
  );

  // 3. Missing key → 401
  const missingKey = await request("/api/web/token", { method: "POST" });
  assert(
    "Token endpoint rejects missing key (401)",
    missingKey.status === 401,
    `status=${missingKey.status}`,
  );

  // 4. Invalid key format → 401
  const invalidKey = await request("/api/web/token", {
    method: "POST",
    headers: { "X-Skilly-Key": "not-a-real-key" },
  });
  assert(
    "Token endpoint rejects invalid key format (401)",
    invalidKey.status === 401,
    `status=${invalidKey.status}`,
  );

  // 5. Disallowed origin → 403 (if we have a real key)
  if (testKey) {
    const disallowed = await request("/api/web/token", {
      method: "POST",
      headers: {
        "X-Skilly-Key": testKey,
        Origin: blockedOrigin,
      },
    });
    assert(
      "Token endpoint rejects disallowed origin (403)",
      disallowed.status === 403,
      `status=${disallowed.status}`,
    );
  } else {
    assert("Token endpoint rejects disallowed origin (403)", false, "skipped: TEST_PUBLISHABLE_KEY not set");
  }

  // 6. Allowed origin → can mint (if OPENAI_API_KEY is live and key/origin valid)
  if (testKey && allowedOrigin) {
    const mint = await request("/api/web/token", {
      method: "POST",
      headers: {
        "X-Skilly-Key": testKey,
        Origin: allowedOrigin,
      },
    });
    const mintBody = await mint.json().catch(() => ({}));
    assert(
      "Token endpoint mints ephemeral secret for allowed origin (200)",
      mint.status === 200 && typeof mintBody.clientSecret === "string" && mintBody.clientSecret.length > 0,
      `status=${mint.status}, hasSecret=${typeof mintBody.clientSecret === "string"}`,
    );
  } else {
    assert(
      "Token endpoint mints ephemeral secret for allowed origin (200)",
      false,
      "skipped: TEST_PUBLISHABLE_KEY and TEST_ALLOWED_ORIGIN not both set",
    );
  }

  // 7. Auth pages load
  const login = await request("/login");
  assert("Login page loads (200)", login.status === 200, `status=${login.status}`);

  const signup = await request("/signup");
  assert("Signup page loads (200)", signup.status === 200, `status=${signup.status}`);

  // 8. Static build artifact served
  const robots = await request("/robots.txt");
  assert("robots.txt served", robots.status === 200, `status=${robots.status}`);

  // Summary
  console.log("\n---");
  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  console.log(`${passed} passed, ${failed} failed (${results.length} total)`);

  if (failed > 0) {
    process.exit(1);
  }
}

run().catch((error) => {
  console.error("Smoke test failed with error:", error);
  process.exit(1);
});
