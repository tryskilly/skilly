import { afterEach, describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import { authenticateMacRequestWithWorkerFallback, verifyMacSessionToken } from "../src/lib/macSession";

const originalEnv = { ...process.env };
const originalFetch = globalThis.fetch;

afterEach(() => {
  process.env = { ...originalEnv };
  globalThis.fetch = originalFetch;
});

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function sign(input: string, secret: string): string {
  return createHmac("sha256", secret).update(input).digest("base64url");
}

function createToken(payload: Record<string, unknown>, secret = "desktop-secret"): string {
  const header = encode({ alg: "HS256", typ: "JWT" });
  const body = encode(payload);
  return `${header}.${body}.${sign(`${header}.${body}`, secret)}`;
}

describe("Mac session verification", () => {
  test("accepts the Worker-issued desktop session token shape", () => {
    process.env.SESSION_TOKEN_SECRET = "desktop-secret";
    const now = Math.floor(Date.now() / 1000);

    const session = verifyMacSessionToken(
      createToken({
        sub: "user_123",
        email: "customer@example.com",
        iat: now,
        exp: now + 60,
        iss: "skilly-proxy",
        aud: "skilly-desktop",
      }),
    );

    expect(session).toEqual({
      userId: "user_123",
      email: "customer@example.com",
      issuedAt: now,
      expiresAt: now + 60,
    });
  });

  test("rejects tampered, expired, or wrong-audience tokens", () => {
    process.env.SESSION_TOKEN_SECRET = "desktop-secret";
    const now = Math.floor(Date.now() / 1000);
    const validPayload = {
      sub: "user_123",
      email: "customer@example.com",
      iat: now,
      exp: now + 60,
      iss: "skilly-proxy",
      aud: "skilly-desktop",
    };

    expect(verifyMacSessionToken(`${createToken(validPayload)}x`)).toBeNull();
    expect(verifyMacSessionToken(createToken({ ...validPayload, exp: now - 1 }))).toBeNull();
    expect(verifyMacSessionToken(createToken({ ...validPayload, aud: "web" }))).toBeNull();
  });

  test("can validate existing Mac sessions through the Worker when Studio lacks the shared secret", async () => {
    delete process.env.SESSION_TOKEN_SECRET;
    process.env.SKILLY_WORKER_BASE_URL = "https://worker.example.com";
    const now = Math.floor(Date.now() / 1000);
    const token = createToken({
      sub: "user_123",
      email: "customer@example.com",
      iat: now,
      exp: now + 60,
      iss: "skilly-proxy",
      aud: "skilly-desktop",
    });

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("https://worker.example.com/entitlement?user_id=user_123");
      expect(init?.headers).toEqual({ authorization: `Bearer ${token}` });
      return new Response(JSON.stringify({ status: "none" }), { status: 200 });
    }) as typeof fetch;

    const session = await authenticateMacRequestWithWorkerFallback(
      new Request("https://studio.example.com/api/mac/entitlement", {
        headers: { authorization: `Bearer ${token}` },
      }),
    );

    expect(session?.userId).toBe("user_123");
    expect(session?.email).toBe("customer@example.com");
  });
});
