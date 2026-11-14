import { describe, expect, test } from "bun:test";
import {
  hostedOpenAIKeyCandidates,
  isOpenAIQuotaFailure,
  mintHostedRealtimeToken,
  TokenMintError,
} from "../src/domain/openaiToken";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status });
}

describe("hosted realtime key selection", () => {
  test("tries the Mac key first, then the shared key, and skips blanks and duplicates", () => {
    expect(hostedOpenAIKeyCandidates({
      OPENAI_API_KEY_MAC: " sk-mac ",
      OPENAI_API_KEY: "sk-shared",
    })).toEqual(["sk-mac", "sk-shared"]);

    expect(hostedOpenAIKeyCandidates({
      OPENAI_API_KEY_MAC: "sk-same",
      OPENAI_API_KEY: "sk-same",
    })).toEqual(["sk-same"]);

    expect(hostedOpenAIKeyCandidates({ OPENAI_API_KEY: "  sk-only  " })).toEqual(["sk-only"]);
    expect(hostedOpenAIKeyCandidates({})).toEqual([]);
  });

  test("recognizes the no-credit errors PostHog recorded", () => {
    expect(isOpenAIQuotaFailure(429, "{\"error\":{\"code\":\"insufficient_quota\"}}")).toBe(true);
    expect(isOpenAIQuotaFailure(429, "You have no credits remaining. Add credits to continue.")).toBe(true);
    expect(isOpenAIQuotaFailure(400, "credit_balance_exhausted")).toBe(true);
    expect(isOpenAIQuotaFailure(401, "invalid_api_key")).toBe(false);
  });

  test("falls through a key with no credit and mints with the next hosted key", async () => {
    const triedKeys: string[] = [];
    const token = await mintHostedRealtimeToken({
      apiKeys: ["sk-empty", "sk-funded"],
      fetchImpl: async (_url, init) => {
        const authorization = new Headers(init?.headers).get("authorization") ?? "";
        triedKeys.push(authorization);
        if (authorization.includes("sk-empty")) {
          return jsonResponse(429, {
            error: { code: "insufficient_quota", message: "You have no credits remaining." },
          });
        }
        return jsonResponse(200, { value: "ek_secret", expires_at: 123, session: { model: "gpt-realtime" } });
      },
    });

    expect(triedKeys).toEqual(["Bearer sk-empty", "Bearer sk-funded"]);
    expect(token.clientSecret).toBe("ek_secret");
  });

  test("when every hosted key has no credit, the failure stays a quota error", async () => {
    await expect(mintHostedRealtimeToken({
      apiKeys: ["sk-a", "sk-b"],
      fetchImpl: async () => jsonResponse(429, { error: { message: "You have no credits remaining." } }),
    })).rejects.toMatchObject({ quotaExhausted: true, upstreamStatus: 429 });
  });

  test("a non-quota rejection is not retried on the next key", async () => {
    let calls = 0;
    await expect(mintHostedRealtimeToken({
      apiKeys: ["sk-a", "sk-b"],
      fetchImpl: async () => {
        calls += 1;
        return jsonResponse(401, { error: { message: "invalid_api_key" } });
      },
    })).rejects.toBeInstanceOf(TokenMintError);
    expect(calls).toBe(1);
  });
});
