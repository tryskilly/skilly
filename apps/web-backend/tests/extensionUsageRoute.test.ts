import { afterEach, beforeEach, describe, expect, test, mock } from "bun:test";
import * as realMacSession from "@/lib/macSession";
import { mintExtensionSessionToken } from "@/lib/extensionSession";

// Spread the real exports before overriding — bun's mock.module() is process-global, so a factory
// returning only recordMacUsage would strip getMacEntitlement (which extensionEntitlementRoute
// .test.ts overrides) and the verify helpers macSession.test.ts imports. Spreading also composes
// safely with that other file's mock in either evaluation order: whichever mock installs second
// captures the first one's overrides through this same spread.
let recordedUsageCalls: Array<Record<string, unknown>> = [];
mock.module("@/lib/macSession", () => ({
  ...realMacSession,
  recordMacUsage: async (input: Record<string, unknown>) => {
    recordedUsageCalls.push(input);
  },
}));

const { POST } = await import("@/app/api/extension/usage/route");

const ORIGINAL_ENV = { ...process.env };

function authedRequest(body: unknown): Request {
  const { token } = mintExtensionSessionToken({ id: "user_abc", email: "person@example.com" });
  return new Request("https://example.com/api/extension/usage", {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("POST /api/extension/usage", () => {
  beforeEach(() => {
    process.env.SESSION_TOKEN_SECRET = "test-secret";
    recordedUsageCalls = [];
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  test("returns 401 with no Authorization header", async () => {
    const response = await POST(
      new Request("https://example.com/api/extension/usage", { method: "POST", body: "{}" }) as never,
    );
    expect(response.status).toBe(401);
    expect(recordedUsageCalls).toHaveLength(0);
  });

  // The source tag is what makes this surface distinguishable in the shared usage table, so a
  // client must not be able to attribute its own traffic to another surface.
  test("records usage tagged source:extension regardless of client input", async () => {
    const response = await POST(authedRequest({ seconds: 42, source: "relay" }) as never);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, recordedSeconds: 42 });
    expect(recordedUsageCalls).toHaveLength(1);
    expect(recordedUsageCalls[0]?.source).toBe("extension");
    expect(recordedUsageCalls[0]?.seconds).toBe(42);
    expect(recordedUsageCalls[0]?.userId).toBe("user_abc");
    expect(recordedUsageCalls[0]?.email).toBe("person@example.com");
  });

  test("clamps a missing seconds value to 0", async () => {
    await POST(authedRequest({}) as never);
    expect(recordedUsageCalls[0]?.seconds).toBe(0);
  });

  test("clamps a negative or non-numeric seconds value to 0", async () => {
    await POST(authedRequest({ seconds: -30 }) as never);
    await POST(authedRequest({ seconds: "not-a-number" }) as never);
    expect(recordedUsageCalls[0]?.seconds).toBe(0);
    expect(recordedUsageCalls[1]?.seconds).toBe(0);
  });

  test("keeps a string result and nulls a non-string one", async () => {
    await POST(authedRequest({ seconds: 5, result: "completed" }) as never);
    await POST(authedRequest({ seconds: 5, result: { nested: true } }) as never);
    expect(recordedUsageCalls[0]?.result).toBe("completed");
    expect(recordedUsageCalls[1]?.result).toBeNull();
  });

  // Telemetry is best-effort: a malformed body must not 500 the extension's reporting path.
  test("treats a malformed JSON body as empty rather than failing", async () => {
    const response = await POST(authedRequest("{not json") as never);
    expect(response.status).toBe(200);
    expect(recordedUsageCalls[0]?.seconds).toBe(0);
  });
});
