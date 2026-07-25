import { afterEach, describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import { verifyMacSessionToken } from "../src/lib/macSession";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
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
});
