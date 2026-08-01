import { describe, expect, test } from "bun:test";
import {
  mintExtensionSessionToken,
  verifyExtensionSessionToken,
  authenticateExtensionRequest,
  selectExtensionOpenAIAPIKey,
} from "@/lib/extensionSession";

const ORIGINAL_ENV = { ...process.env };

function withSecret<T>(secret: string | undefined, run: () => T): T {
  process.env.SESSION_TOKEN_SECRET = secret;
  try {
    return run();
  } finally {
    process.env = { ...ORIGINAL_ENV };
  }
}

describe("mintExtensionSessionToken / verifyExtensionSessionToken", () => {
  test("a freshly minted token verifies back to the same user", () => {
    withSecret("test-secret", () => {
      const { token, expiresAt } = mintExtensionSessionToken({ id: "user_123", email: "a@b.com" });
      expect(expiresAt).toBeGreaterThan(Date.now() / 1000);
      const session = verifyExtensionSessionToken(token);
      expect(session).toEqual({
        userId: "user_123",
        email: "a@b.com",
        issuedAt: session!.issuedAt,
        expiresAt: session!.expiresAt,
      });
    });
  });

  test("rejects a token signed with a different secret", () => {
    const token = withSecret("secret-a", () => mintExtensionSessionToken({ id: "u", email: "e@x.com" }).token);
    withSecret("secret-b", () => {
      expect(verifyExtensionSessionToken(token)).toBeNull();
    });
  });

  test("rejects malformed tokens", () => {
    withSecret("test-secret", () => {
      expect(verifyExtensionSessionToken("not-a-real-token")).toBeNull();
      expect(verifyExtensionSessionToken("")).toBeNull();
    });
  });

  test("a Mac session token (different audience) does not verify as an extension session", () => {
    // Cross-audience rejection matters: a Mac-issued token must never be replayable
    // against /api/extension/* routes, and vice versa.
    withSecret("shared-secret", () => {
      // Hand-construct a token with the Mac audience using the same low-level shape
      // extensionSession.ts uses, to prove the audience check actually discriminates.
      const header = Buffer.from(JSON.stringify({ alg: "HS256" })).toString("base64url");
      const payload = Buffer.from(
        JSON.stringify({
          sub: "user_123",
          email: "a@b.com",
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 3600,
          iss: "skilly-studio",
          aud: "skilly-desktop", // wrong audience on purpose
        }),
      ).toString("base64url");
      const { createHmac } = require("node:crypto");
      const signature = createHmac("sha256", "shared-secret")
        .update(`${header}.${payload}`)
        .digest("base64url");
      expect(verifyExtensionSessionToken(`${header}.${payload}.${signature}`)).toBeNull();
    });
  });
});

describe("authenticateExtensionRequest", () => {
  test("extracts and verifies a Bearer token from the Authorization header", () => {
    withSecret("test-secret", () => {
      const { token } = mintExtensionSessionToken({ id: "user_123", email: "a@b.com" });
      const request = new Request("https://example.com", { headers: { authorization: `Bearer ${token}` } });
      expect(authenticateExtensionRequest(request)?.userId).toBe("user_123");
    });
  });

  test("returns null with no Authorization header", () => {
    withSecret("test-secret", () => {
      expect(authenticateExtensionRequest(new Request("https://example.com"))).toBeNull();
    });
  });

  test("returns null for a non-Bearer scheme", () => {
    withSecret("test-secret", () => {
      const request = new Request("https://example.com", { headers: { authorization: "Basic abc" } });
      expect(authenticateExtensionRequest(request)).toBeNull();
    });
  });
});

describe("selectExtensionOpenAIAPIKey", () => {
  test("prefers OPENAI_API_KEY_EXTENSION over OPENAI_API_KEY", () => {
    process.env.OPENAI_API_KEY_EXTENSION = "key-extension";
    process.env.OPENAI_API_KEY = "key-shared";
    expect(selectExtensionOpenAIAPIKey()).toBe("key-extension");
    process.env = { ...ORIGINAL_ENV };
  });

  test("falls back to OPENAI_API_KEY when OPENAI_API_KEY_EXTENSION is unset", () => {
    delete process.env.OPENAI_API_KEY_EXTENSION;
    process.env.OPENAI_API_KEY = "key-shared";
    expect(selectExtensionOpenAIAPIKey()).toBe("key-shared");
    process.env = { ...ORIGINAL_ENV };
  });
});
