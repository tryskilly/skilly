import { afterEach, describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import { authenticateMacRequest, verifyMacSessionToken, selectMacRealtimeModel } from "../src/lib/macSession";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

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
  test("preserves only allowlisted desktop model overrides", () => {
    expect(selectMacRealtimeModel("gpt-realtime-2.1-mini")).toBe("gpt-realtime-2.1-mini");
    expect(selectMacRealtimeModel("arbitrary-model")).toBeUndefined();
    expect(selectMacRealtimeModel(null)).toBeUndefined();
  });
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
    expect(verifyMacSessionToken(`${createToken(validPayload)}.extra`)).toBeNull();
    expect(verifyMacSessionToken(createToken({ ...validPayload, exp: now - 1 }))).toBeNull();
    expect(verifyMacSessionToken(createToken({ ...validPayload, aud: "web" }))).toBeNull();
  });

  test("missing local secret fails closed without contacting the Worker", async () => {
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

    let networkCalls = 0;
    globalThis.fetch = Object.assign(async () => {
      networkCalls++;
      throw new Error("Authentication must not contact a second backend");
    }, { preconnect: originalFetch.preconnect });

    const session = authenticateMacRequest(
      new Request("https://studio.example.com/api/mac/entitlement", {
        headers: { authorization: `Bearer ${token}` },
      }),
    );

    expect(session).toBeNull();
    expect(networkCalls).toBe(0);
  });

  test("accepts Studio desktop tokens but never extension tokens", () => {
    process.env.SESSION_TOKEN_SECRET = "desktop-secret";
    const now = Math.floor(Date.now() / 1000);
    const payload = { sub: "user_123", email: "customer@example.com", iat: now, exp: now + 60, iss: "skilly-studio", aud: "skilly-desktop" };
    expect(verifyMacSessionToken(createToken(payload))?.userId).toBe("user_123");
    expect(verifyMacSessionToken(createToken({ ...payload, aud: "skilly-extension" }))).toBeNull();
  });
});

describe("Authoritative Studio storage", () => {
  test("missing database cannot masquerade as no subscription or a saved event", () => {
    // Other route suites mock this module. Exercise the real database functions
    // in an isolated process so file ordering cannot turn this into a stub test.
    const output = execFileSync(process.execPath, ["run", fileURLToPath(new URL("../scripts/check-storage-failure-contract.ts", import.meta.url))], { encoding: "utf8" });
    expect(output).toContain("3 storage failure contracts passed");
  });
});
