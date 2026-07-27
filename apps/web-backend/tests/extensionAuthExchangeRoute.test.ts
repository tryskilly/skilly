import { afterEach, describe, expect, test, mock } from "bun:test";
import * as realWorkosAuth from "@/lib/workosAuth";

// bun's mock.module() fully replaces the module's export set for the REST OF THE ENTIRE TEST
// PROCESS (there is no per-file scoping or automatic restore for module mocks, unlike
// mock.restore() for function mocks) — so a factory that only returns exchangeWorkOSCode
// permanently breaks every other file that imports anything else from "@/lib/workosAuth"
// (confirmed: it broke tests/workosAuth.test.ts's `createSelfServeDashboardMembership` import
// when running the full suite). The fix is to spread the real module's exports first — captured
// via the static `import * as realWorkosAuth` above, which resolves before this mock.module call
// runs since import declarations are hoisted — and override only exchangeWorkOSCode. Everything
// else in "@/lib/workosAuth" keeps behaving exactly as it does unmocked, for every test file in
// the run, before and after this one. Also uses the real WorkOSUpstreamError class (rather than
// a redeclared lookalike) so the route's `error instanceof WorkOSUpstreamError` check — and any
// other file's own instanceof checks against this module — keep working off one true class
// identity.
mock.module("@/lib/workosAuth", () => ({
  ...realWorkosAuth,
  exchangeWorkOSCode: async (code: string) => {
    if (code === "bad-code") {
      throw new realWorkosAuth.WorkOSUpstreamError("WorkOS authenticate failed", 400, "bad_request");
    }
    return {
      user: { id: "user_abc", email: "person@example.com", firstName: "A", lastName: "B" },
      workosOrganizationId: null,
    };
  },
}));

const { POST } = await import("@/app/api/extension/auth/exchange/route");

// mintExtensionSessionToken (Task 2) requires SESSION_TOKEN_SECRET; the ambient test env doesn't
// set one, so scope it the same way macSession.test.ts / extensionSession.test.ts do — set only
// for the test that exercises the minting path, restore afterward so it can't leak into other
// test files running in the same bun test process.
const ORIGINAL_ENV = { ...process.env };

describe("POST /api/extension/auth/exchange", () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  test("mints a session token on a valid code", async () => {
    process.env.SESSION_TOKEN_SECRET = "test-secret";
    const request = new Request("https://example.com/api/extension/auth/exchange", {
      method: "POST",
      body: JSON.stringify({ code: "good-code" }),
    });
    const response = await POST(request as never);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { sessionToken: string; expiresAt: number; email: string };
    expect(typeof body.sessionToken).toBe("string");
    expect(body.email).toBe("person@example.com");
    expect(body.expiresAt).toBeGreaterThan(Date.now() / 1000);
  });

  test("returns 400 when the request body has no code", async () => {
    const request = new Request("https://example.com/api/extension/auth/exchange", {
      method: "POST",
      body: JSON.stringify({}),
    });
    const response = await POST(request as never);
    expect(response.status).toBe(400);
  });

  test("returns 401 when WorkOS rejects the code", async () => {
    const request = new Request("https://example.com/api/extension/auth/exchange", {
      method: "POST",
      body: JSON.stringify({ code: "bad-code" }),
    });
    const response = await POST(request as never);
    expect(response.status).toBe(401);
  });
});
