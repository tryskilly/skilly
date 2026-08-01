import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { TokenMintError } from "@/domain/openaiToken";
import { mintExtensionSessionToken } from "@/lib/extensionSession";
import {
  handleExtensionOpenAITokenRequest,
  type ExtensionOpenAITokenDependencies,
} from "@/lib/extensionOpenaiTokenRoute";

const dependencies: ExtensionOpenAITokenDependencies = {
  mintRealtimeToken: async () => {
    if (process.env.OPENAI_API_KEY_EXTENSION === "sk-upstream-failure") {
      throw new TokenMintError("OpenAI rejected the mint", 429);
    }
    return { clientSecret: "ek_test_123", expiresAt: Math.floor(Date.now() / 1000) + 60, model: "gpt-realtime" };
  },
  captureServerEvent: async () => undefined,
};

const ORIGINAL_ENV = { ...process.env };

function authedRequest(): Request {
  const { token } = mintExtensionSessionToken({ id: "user_abc", email: "person@example.com" });
  return new Request("https://example.com/api/extension/openai/token", {
    headers: { authorization: `Bearer ${token}` },
  });
}

describe("GET /api/extension/openai/token", () => {
  beforeEach(() => {
    process.env.SESSION_TOKEN_SECRET = "test-secret";
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  test("returns 401 with no Authorization header", async () => {
    const response = await handleExtensionOpenAITokenRequest(
      new Request("https://example.com/api/extension/openai/token") as never,
      dependencies,
    );
    expect(response.status).toBe(401);
  });

  test("mints a token for an authenticated request", async () => {
    process.env.OPENAI_API_KEY_EXTENSION = "sk-test";
    const response = await handleExtensionOpenAITokenRequest(authedRequest() as never, dependencies);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { clientSecret: string; model: string };
    expect(body.clientSecret).toBe("ek_test_123");
    expect(body.model).toBe("gpt-realtime");
  });

  test("returns 500 when no OpenAI key is configured", async () => {
    delete process.env.OPENAI_API_KEY_EXTENSION;
    delete process.env.OPENAI_API_KEY;
    const response = await handleExtensionOpenAITokenRequest(authedRequest() as never, dependencies);
    expect(response.status).toBe(500);
  });

  test("returns 502 when the upstream mint fails", async () => {
    process.env.OPENAI_API_KEY_EXTENSION = "sk-upstream-failure";
    const response = await handleExtensionOpenAITokenRequest(authedRequest() as never, dependencies);
    expect(response.status).toBe(502);
  });

  // The unauthenticated path must short-circuit before the key check, so a misconfigured server
  // still answers 401 (not 500) to a caller with no credentials — otherwise the response leaks
  // server configuration state to anyone who asks.
  test("prefers 401 over 500 when the request is both unauthenticated and unconfigured", async () => {
    delete process.env.OPENAI_API_KEY_EXTENSION;
    delete process.env.OPENAI_API_KEY;
    const response = await handleExtensionOpenAITokenRequest(
      new Request("https://example.com/api/extension/openai/token") as never,
      dependencies,
    );
    expect(response.status).toBe(401);
  });
});
