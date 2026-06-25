import { describe, expect, test } from "bun:test";
import { MemoryRepo, DEMO_PUBLISHABLE_KEY, defaultSeed } from "../src/db/memoryRepo";
import { authenticateWebRequest, mintTokenForRequest } from "../src/tenantService";

const ALLOWED_ORIGIN = "http://localhost:4399";

// Fake OpenAI client_secrets endpoint (typed structurally as FetchLike).
const okFetch = async (): Promise<Response> =>
  new Response(JSON.stringify({ value: "ek_test_secret", expires_at: 1893456000 }), { status: 200 });
const failFetch = async (): Promise<Response> => new Response("unauthorized", { status: 401 });

describe("authenticateWebRequest", () => {
  test("accepts the demo key from an allowed origin", async () => {
    const result = await authenticateWebRequest(new MemoryRepo(), {
      rawKey: DEMO_PUBLISHABLE_KEY,
      origin: ALLOWED_ORIGIN,
    });
    expect(result.ok).toBe(true);
  });

  test("rejects malformed keys (401)", async () => {
    const result = await authenticateWebRequest(new MemoryRepo(), { rawKey: "garbage", origin: ALLOWED_ORIGIN });
    expect(result).toMatchObject({ ok: false, status: 401 });
  });

  test("rejects unknown keys (401)", async () => {
    const result = await authenticateWebRequest(new MemoryRepo(), {
      rawKey: "pk_test_unknownunknownunknownunknown",
      origin: ALLOWED_ORIGIN,
    });
    expect(result).toMatchObject({ ok: false, status: 401 });
  });

  test("rejects disallowed origins (403)", async () => {
    const result = await authenticateWebRequest(new MemoryRepo(), {
      rawKey: DEMO_PUBLISHABLE_KEY,
      origin: "https://evil.example.com",
    });
    expect(result).toMatchObject({ ok: false, status: 403 });
  });
});

describe("mintTokenForRequest", () => {
  test("mints a token on the happy path and meters the mint", async () => {
    const repo = new MemoryRepo();
    const outcome = await mintTokenForRequest(repo, {
      rawKey: DEMO_PUBLISHABLE_KEY,
      origin: ALLOWED_ORIGIN,
      openaiApiKey: "sk-test",
      fetchImpl: okFetch,
    });
    expect(outcome.status).toBe(200);
    expect(outcome.body.clientSecret).toBe("ek_test_secret");
    expect(await repo.getUsageSecondsThisPeriod(defaultSeed().tenants[0]!.id)).toBe(0); // token_mint = 0s
  });

  test("returns 429 when the tenant is over its quota", async () => {
    // Tenant with a 1s cap; pre-record usage so the next mint is blocked.
    const tenantId = "22222222-2222-2222-2222-222222222222";
    const repo = new MemoryRepo({
      tenants: [
        { id: tenantId, name: "Capped", allowedOrigins: [ALLOWED_ORIGIN], allowedAppIds: [], usageCapSeconds: 1, polarCustomerId: null },
      ],
      keys: [{ rawKey: "pk_test_cappedcappedcappedcapped01", keyType: "publishable", tenantId }],
      skills: [],
    });
    await repo.recordUsage({ tenantId, kind: "session_seconds", seconds: 5 });

    const outcome = await mintTokenForRequest(repo, {
      rawKey: "pk_test_cappedcappedcappedcapped01",
      origin: ALLOWED_ORIGIN,
      openaiApiKey: "sk-test",
      fetchImpl: okFetch,
    });
    expect(outcome.status).toBe(429);
  });

  test("returns 502 when the upstream mint fails", async () => {
    const outcome = await mintTokenForRequest(new MemoryRepo(), {
      rawKey: DEMO_PUBLISHABLE_KEY,
      origin: ALLOWED_ORIGIN,
      openaiApiKey: "sk-test",
      fetchImpl: failFetch,
    });
    expect(outcome.status).toBe(502);
  });
});
