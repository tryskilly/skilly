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
const DEFAULT_MODEL = "gpt-realtime";

export class TokenMintError extends Error {
  constructor(
    message: string,
    public readonly upstreamStatus: number,
  ) {
    super(message);
    this.name = "TokenMintError";
  }
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
    throw new TokenMintError(`OpenAI client_secrets returned ${response.status}`, response.status);
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
