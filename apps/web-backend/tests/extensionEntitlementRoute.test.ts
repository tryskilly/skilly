import { afterEach, beforeEach, describe, expect, test, mock } from "bun:test";
import * as realMacSession from "@/lib/macSession";
import { mintExtensionSessionToken } from "@/lib/extensionSession";

// bun's mock.module() replaces a module's export set for the rest of the test PROCESS, with no
// per-file scoping — so a factory returning only getMacEntitlement would permanently break
// tests/macSession.test.ts (which imports the real verify/select helpers from this same module).
// Spread the real exports first (captured by the hoisted `import * as realMacSession` above) and
// override only the one function this route's tests need to control. Same pattern, and same
// reason, as tests/extensionAuthExchangeRoute.test.ts.
mock.module("@/lib/macSession", () => ({
  ...realMacSession,
  getMacEntitlement: async (userId: string) =>
    userId === "user_with_entitlement"
      ? {
          user_id: userId,
          status: "active" as const,
          entitlement_type: "relay" as const,
          period_start: null,
          period_end: null,
          plan: "pro",
          polar_customer_id: null,
        }
      : null,
}));

const { GET } = await import("@/app/api/extension/entitlement/route");

// Both minting and verifying read SESSION_TOKEN_SECRET from the ambient env, which the test
// environment doesn't set. Scope it per-test and restore, so it can't leak into other files
// sharing this bun test process.
const ORIGINAL_ENV = { ...process.env };

function authedRequest(userId: string): Request {
  const { token } = mintExtensionSessionToken({ id: userId, email: "person@example.com" });
  return new Request("https://example.com/api/extension/entitlement", {
    headers: { authorization: `Bearer ${token}` },
  });
}

describe("GET /api/extension/entitlement", () => {
  beforeEach(() => {
    process.env.SESSION_TOKEN_SECRET = "test-secret";
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  test("returns 401 with no Authorization header", async () => {
    const response = await GET(new Request("https://example.com/api/extension/entitlement") as never);
    expect(response.status).toBe(401);
  });

  test("returns 401 for a token signed with a different secret", async () => {
    const request = authedRequest("user_with_entitlement");
    process.env.SESSION_TOKEN_SECRET = "a-different-secret";
    const response = await GET(request as never);
    expect(response.status).toBe(401);
  });

  test("returns the entitlement record for a user who has one", async () => {
    const response = await GET(authedRequest("user_with_entitlement") as never);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { status: string; user_id: string };
    expect(body.status).toBe("active");
    expect(body.user_id).toBe("user_with_entitlement");
  });

  test("returns status:none for a user with no entitlement row, not a 404", async () => {
    const response = await GET(authedRequest("user_without_entitlement") as never);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { status: string; user_id: string };
    expect(body.status).toBe("none");
    expect(body.user_id).toBe("user_without_entitlement");
  });

  // The route must never read a caller-supplied user id — an extension session may only ever see
  // its own entitlement, so a spoofed ?user_id= has to be ignored rather than honored.
  test("ignores a ?user_id= query param and answers for the authenticated user", async () => {
    const { token } = mintExtensionSessionToken({ id: "user_without_entitlement", email: "person@example.com" });
    const request = new Request("https://example.com/api/extension/entitlement?user_id=user_with_entitlement", {
      headers: { authorization: `Bearer ${token}` },
    });
    const response = await GET(request as never);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { status: string; user_id: string };
    expect(body.user_id).toBe("user_without_entitlement");
    expect(body.status).toBe("none");
  });
});
