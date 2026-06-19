#!/usr/bin/env bun
/**
 * Local functional test for Skilly Studio.
 *
 * Runs against the in-memory demo tenant on localhost:4310.
 * Start the dev server first:
 *
 *   bun run dev
 *
 * Then in another terminal:
 *
 *   bun run test:functional
 */

import { DEMO_PUBLISHABLE_KEY } from "../src/db/memoryRepo";

const baseUrl = process.env.STUDIO_BASE_URL ?? "http://localhost:4310";
const demoKey = DEMO_PUBLISHABLE_KEY;
const allowedOrigin = "http://localhost:4399";
const blockedOrigin = "https://evil.example.com";

const results: { name: string; ok: boolean; detail?: string }[] = [];

function assert(name: string, ok: boolean, detail?: string) {
  results.push({ name, ok, detail });
  const icon = ok ? "✓" : "✗";
  console.log(`${icon} ${name}${detail ? ` — ${detail}` : ""}`);
}

async function request(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${baseUrl}${path}`, init);
}

async function parseJson(response: Response): Promise<Record<string, unknown>> {
  try {
    const parsed = (await response.json()) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

async function run() {
  console.log(`Functional testing ${baseUrl} (demo tenant)\n`);

  // 1. Health
  const health = await request("/api/health");
  const healthBody = await parseJson(health);
  assert(
    "Health endpoint is healthy",
    health.status === 200 && healthBody.ok === true,
    `status=${health.status}, ok=${healthBody.ok}`,
  );

  // 2. Auth redirects (Next.js may append ?next= to the login URL)
  const dashboard = await request("/dashboard", { redirect: "manual" });
  const dashboardLocation = dashboard.headers.get("location") ?? "";
  assert(
    "Dashboard redirects to login when unauthenticated",
    (dashboard.status === 302 || dashboard.status === 307) && dashboardLocation.startsWith("/login"),
    `status=${dashboard.status}, location=${dashboardLocation}`,
  );

  const admin = await request("/dashboard/admin/tenants", { redirect: "manual" });
  assert(
    "Admin area also redirects to login when unauthenticated",
    admin.status === 302 || admin.status === 307,
    `status=${admin.status}`,
  );

  // 3. Web API — missing key
  const missingKey = await request("/api/web/token", { method: "POST" });
  const missingKeyBody = await parseJson(missingKey);
  assert(
    "Token endpoint rejects missing key with 401",
    missingKey.status === 401,
    `status=${missingKey.status}, error=${missingKeyBody.error ?? "n/a"}`,
  );

  // 4. Web API — invalid key format
  const invalidKey = await request("/api/web/token", {
    method: "POST",
    headers: { "X-Skilly-Key": "not-a-real-key" },
  });
  assert(
    "Token endpoint rejects malformed key with 401",
    invalidKey.status === 401,
    `status=${invalidKey.status}`,
  );

  // 5. Web API — unknown but well-formed key
  const unknownKey = await request("/api/web/token", {
    method: "POST",
    headers: { "X-Skilly-Key": "pk_live_000000000000000000000000" },
  });
  assert(
    "Token endpoint rejects unknown key with 401",
    unknownKey.status === 401,
    `status=${unknownKey.status}`,
  );

  // 6. Web API — disallowed origin
  const disallowedOrigin = await request("/api/web/token", {
    method: "POST",
    headers: {
      "X-Skilly-Key": demoKey,
      Origin: blockedOrigin,
    },
  });
  assert(
    "Token endpoint rejects disallowed origin with 403",
    disallowedOrigin.status === 403,
    `status=${disallowedOrigin.status}`,
  );

  // 7. Web API — CORS preflight for allowed origin
  const preflight = await request("/api/web/token", {
    method: "OPTIONS",
    headers: {
      Origin: allowedOrigin,
      "Access-Control-Request-Method": "POST",
    },
  });
  assert(
    "CORS preflight succeeds for allowed origin",
    preflight.status === 204 && preflight.headers.get("access-control-allow-origin")?.includes(allowedOrigin),
    `status=${preflight.status}, acao=${preflight.headers.get("access-control-allow-origin")}`,
  );

  // 8. Web API — allowed origin can mint a token
  const mint = await request("/api/web/token", {
    method: "POST",
    headers: {
      "X-Skilly-Key": demoKey,
      Origin: allowedOrigin,
    },
  });
  const mintBody = await parseJson(mint);
  const mintSecret = mintBody.clientSecret;
  assert(
    "Token endpoint mints ephemeral secret for allowed origin",
    mint.status === 200 && typeof mintSecret === "string" && mintSecret.length > 0,
    `status=${mint.status}, hasSecret=${typeof mintSecret === "string"}`,
  );

  // 9. Web API — skill fetch
  const skill = await request("/api/web/skill?skill=default", {
    headers: { "X-Skilly-Key": demoKey, Origin: allowedOrigin },
  });
  const skillText = await skill.text();
  assert(
    "Skill endpoint serves the tenant SKILL.md",
    skill.status === 200 && skillText.includes("Acme Onboarding"),
    `status=${skill.status}, length=${skillText.length}`,
  );

  // 10. Web API — usage report
  const usage = await request("/api/web/usage", {
    method: "POST",
    headers: {
      "X-Skilly-Key": demoKey,
      Origin: allowedOrigin,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      seconds: 42,
      page: "/projects",
      domain: "app.acme.com",
      durationSeconds: 42,
      result: "completed",
    }),
  });
  assert(
    "Usage endpoint accepts session report",
    usage.status === 200 || usage.status === 204,
    `status=${usage.status}`,
  );

  // 11. Web API — quota enforcement
  // Each usage report is clamped to 3_600s; the demo cap is 10_800s.
  // Report four hours to push the tenant over its monthly cap.
  for (let index = 0; index < 4; index++) {
    await request("/api/web/usage", {
      method: "POST",
      headers: {
        "X-Skilly-Key": demoKey,
        Origin: allowedOrigin,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ seconds: 3_600 }),
    });
  }
  const overQuota = await request("/api/web/token", {
    method: "POST",
    headers: {
      "X-Skilly-Key": demoKey,
      Origin: allowedOrigin,
    },
  });
  const overQuotaBody = await parseJson(overQuota);
  assert(
    "Token endpoint returns 429 when tenant is over quota",
    overQuota.status === 429,
    `status=${overQuota.status}, error=${overQuotaBody.error ?? "n/a"}`,
  );

  // 12. Static pages load
  const login = await request("/login");
  assert("Login page loads", login.status === 200, `status=${login.status}`);

  const signup = await request("/signup");
  assert("Signup page loads", signup.status === 200, `status=${signup.status}`);

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
  console.error("Functional test failed with error:", error);
  process.exit(1);
});
