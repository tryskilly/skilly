// Request authentication + token-mint flow. Pure orchestration over the repo +
// domain modules, returning plain result objects the route handlers map to HTTP.
// Kept framework-free so it's unit-testable without Next.

import { hashKey, isValidKeyFormat } from "./domain/keys";
import { matchOrigin } from "./domain/origin";
import { isOverQuota, remainingSeconds } from "./domain/quota";
import {
  mintRealtimeToken,
  TokenMintError,
  type EphemeralToken,
  type FetchLike,
} from "./domain/openaiToken";
import type { Tenant, WebBackendRepo } from "./db/repo";

export interface AuthSuccess {
  ok: true;
  tenant: Tenant;
}
export interface AuthFailure {
  ok: false;
  status: 401 | 403;
  error: string;
}
export type AuthResult = AuthSuccess | AuthFailure;

export interface AuthParams {
  rawKey: string | null;
  origin: string | null;
}

/** Validate the publishable key + origin allowlist for an inbound widget request. */
export async function authenticateWebRequest(
  repo: WebBackendRepo,
  params: AuthParams,
): Promise<AuthResult> {
  if (!params.rawKey || !isValidKeyFormat(params.rawKey)) {
    return { ok: false, status: 401, error: "missing or malformed API key" };
  }

  const lookup = await repo.findTenantByKeyHash(hashKey(params.rawKey));
  if (!lookup) {
    return { ok: false, status: 401, error: "unknown or revoked API key" };
  }

  if (!matchOrigin(params.origin, lookup.tenant.allowedOrigins)) {
    return { ok: false, status: 403, error: "origin not allowed for this key" };
  }

  return { ok: true, tenant: lookup.tenant };
}

export interface MintParams extends AuthParams {
  openaiApiKey: string;
  model?: string;
  fetchImpl?: FetchLike;
}

export interface MintOutcome {
  status: 200 | 401 | 403 | 429 | 500 | 502;
  body: Record<string, unknown>;
}

/** Authenticate → quota-check → mint an ephemeral OpenAI token → record usage. */
export async function mintTokenForRequest(
  repo: WebBackendRepo,
  params: MintParams,
): Promise<MintOutcome> {
  const auth = await authenticateWebRequest(repo, params);
  if (!auth.ok) {
    return { status: auth.status, body: { error: auth.error } };
  }

  const usageSecondsThisPeriod = await repo.getUsageSecondsThisPeriod(auth.tenant.id);
  const capSeconds = auth.tenant.usageCapSeconds;
  if (isOverQuota({ usageSecondsThisPeriod, capSeconds })) {
    return { status: 429, body: { error: "monthly usage quota reached" } };
  }

  // Server-config check AFTER auth so invalid requests still get 401/403, not 500.
  if (!params.openaiApiKey) {
    return { status: 500, body: { error: "server is missing OPENAI_API_KEY" } };
  }

  let token: EphemeralToken;
  try {
    token = await mintRealtimeToken({
      apiKey: params.openaiApiKey,
      model: params.model,
      fetchImpl: params.fetchImpl,
    });
  } catch (mintError) {
    const status = mintError instanceof TokenMintError ? 502 : 502;
    return { status, body: { error: "failed to mint realtime token" } };
  }

  // The mint itself is metered as 0s; session seconds are recorded in 8.3/8.6.
  await repo.recordUsage({ tenantId: auth.tenant.id, kind: "token_mint", seconds: 0 });

  return {
    status: 200,
    body: {
      clientSecret: token.clientSecret,
      expiresAt: token.expiresAt,
      model: token.model,
      remainingSeconds: remainingSeconds({ usageSecondsThisPeriod, capSeconds }),
    },
  };
}
