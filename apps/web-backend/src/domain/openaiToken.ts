// Mint a short-lived OpenAI Realtime client secret. The raw OPENAI_API_KEY stays
// server-side; the widget only ever receives the ephemeral secret. This is the
// multi-tenant successor to the Cloudflare Worker's /openai/token route.
//
// `fetchImpl` is injectable so the mint logic is unit-testable without a network.

export interface EphemeralToken {
  clientSecret: string;
  expiresAt: number | null;
  model: string;
}

// Minimal fetch shape — the real global `fetch` and test stubs both satisfy it
// (without the global's extra `preconnect` member).
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface MintOptions {
  apiKey: string;
  model?: string;
  fetchImpl?: FetchLike;
}

const CLIENT_SECRETS_URL = "https://api.openai.com/v1/realtime/client_secrets";
// Override to A/B a cheaper model (e.g. "gpt-realtime-mini") via env, no redeploy of code needed.
const DEFAULT_MODEL = process.env.OPENAI_REALTIME_MODEL ?? "gpt-realtime";

export class TokenMintError extends Error {
  constructor(
    message: string,
    public readonly upstreamStatus: number,
    public readonly quotaExhausted = false,
  ) {
    super(message);
    this.name = "TokenMintError";
  }
}

/** OpenAI's "no credits" family. Matched on code or message so a renamed code still counts. */
export function isOpenAIQuotaFailure(status: number, bodyText: string): boolean {
  const lowered = bodyText.toLowerCase();
  if (
    lowered.includes("insufficient_quota") ||
    lowered.includes("credit_balance_exhausted") ||
    lowered.includes("no credits remaining") ||
    lowered.includes("exceeded your current quota") ||
    lowered.includes("billing_hard_limit_reached")
  ) {
    return true;
  }
  return status === 402;
}

/**
 * Hosted trial keys, in the order a Mac session should try them.
 * A key that has no credit is skipped for the next candidate. Values are
 * trimmed and de-duplicated. The raw key never leaves this function's caller.
 */
export function hostedOpenAIKeyCandidates(environment: {
  OPENAI_API_KEY_MAC?: string;
  OPENAI_API_KEY?: string;
}): string[] {
  const candidates: string[] = [];
  const seen = new Set<string>();
  for (const value of [environment.OPENAI_API_KEY_MAC, environment.OPENAI_API_KEY]) {
    const trimmed = value?.trim() ?? "";
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    candidates.push(trimmed);
  }
  return candidates;
}

export async function mintRealtimeToken(options: MintOptions): Promise<EphemeralToken> {
  const model = options.model ?? DEFAULT_MODEL;
  const fetchImpl = options.fetchImpl ?? fetch;

  const response = await fetchImpl(CLIENT_SECRETS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${options.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ session: { type: "realtime", model } }),
  });

  if (!response.ok) {
    const bodyText = await response.text();
    throw new TokenMintError(
      `OpenAI client_secrets returned ${response.status}`,
      response.status,
      isOpenAIQuotaFailure(response.status, bodyText),
    );
  }

  const payload = (await response.json()) as {
    value?: string;
    client_secret?: { value?: string; expires_at?: number };
    expires_at?: number;
  };

  // The GA endpoint returns { value, expires_at }; tolerate the older nested shape.
  const clientSecret = payload.value ?? payload.client_secret?.value;
  if (!clientSecret) {
    throw new TokenMintError("OpenAI response missing client secret", response.status);
  }
  const expiresAt = payload.expires_at ?? payload.client_secret?.expires_at ?? null;

  return { clientSecret, expiresAt, model };
}

/** Try each hosted key. A no-credit key is not the end of the trial if another key is configured. */
export async function mintHostedRealtimeToken(options: {
  apiKeys: string[];
  model?: string;
  fetchImpl?: FetchLike;
}): Promise<EphemeralToken> {
  if (options.apiKeys.length === 0) {
    throw new TokenMintError("OpenAI API key not configured", 500, false);
  }

  let lastQuotaError: TokenMintError | null = null;
  for (const apiKey of options.apiKeys) {
    try {
      return await mintRealtimeToken({
        apiKey,
        model: options.model,
        fetchImpl: options.fetchImpl,
      });
    } catch (error) {
      if (error instanceof TokenMintError && error.quotaExhausted) {
        lastQuotaError = error;
        continue;
      }
      throw error;
    }
  }

  throw lastQuotaError ?? new TokenMintError("OpenAI API key not configured", 500, false);
}
