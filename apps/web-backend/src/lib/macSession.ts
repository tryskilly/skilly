import { createHmac, timingSafeEqual } from "node:crypto";
import { getDatabaseUrl } from "@/db";
import { Pool } from "pg";

export interface MacSession {
  userId: string;
  email: string;
  issuedAt: number;
  expiresAt: number;
}

export interface MacEntitlementRecord {
  user_id: string;
  status: "active" | "canceled" | "none";
  entitlement_type?: "relay" | "byok" | null;
  period_start?: string | null;
  period_end?: string | null;
  plan?: string | null;
  polar_customer_id?: string | null;
}

const MAC_SESSION_ISSUER = "skilly-proxy";
const MAC_SESSION_AUDIENCE = "skilly-desktop";
const MAC_USAGE_MAX_SECONDS = 3600;
const DEFAULT_WORKER_BASE_URL = "https://skilly-proxy.eng-mohamedszaied.workers.dev";

function sessionSecret(): string | null {
  const secret = process.env.SESSION_TOKEN_SECRET;
  if (!secret) {
    return null;
  }
  return secret;
}

function signPayload(payload: string): string | null {
  const secret = sessionSecret();
  return secret ? createHmac("sha256", secret).update(payload).digest("base64url") : null;
}

function signaturesMatch(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function decodeBase64UrlJson(value: string): Record<string, unknown> | null {
  try {
    return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function verifyMacSessionToken(token: string): MacSession | null {
  const [encodedHeader, encodedPayload, signature] = token.split(".");
  if (!encodedHeader || !encodedPayload || !signature) {
    return null;
  }
  const expectedSignature = signPayload(`${encodedHeader}.${encodedPayload}`);
  if (!expectedSignature || !signaturesMatch(signature, expectedSignature)) {
    return null;
  }
  const payload = decodeBase64UrlJson(encodedPayload);
  return sessionFromPayload(payload);
}

function sessionFromPayload(payload: Record<string, unknown> | null): MacSession | null {
  const userId = payload?.sub;
  const email = payload?.email;
  const issuedAt = payload?.iat;
  const expiresAt = payload?.exp;
  if (
    typeof userId !== "string" ||
    typeof email !== "string" ||
    typeof issuedAt !== "number" ||
    typeof expiresAt !== "number" ||
    payload?.iss !== MAC_SESSION_ISSUER ||
    payload?.aud !== MAC_SESSION_AUDIENCE ||
    expiresAt <= Math.floor(Date.now() / 1000)
  ) {
    return null;
  }
  return { userId, email, issuedAt, expiresAt };
}

export function authenticateMacRequest(request: Request): MacSession | null {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return null;
  }
  const token = authorization.slice("Bearer ".length).trim();
  return token ? verifyMacSessionToken(token) : null;
}

export async function authenticateMacRequestWithWorkerFallback(request: Request): Promise<MacSession | null> {
  const verifiedSession = authenticateMacRequest(request);
  if (verifiedSession) {
    return verifiedSession;
  }

  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return null;
  }
  const token = authorization.slice("Bearer ".length).trim();
  const [, encodedPayload] = token.split(".");
  const session = sessionFromPayload(encodedPayload ? decodeBase64UrlJson(encodedPayload) : null);
  if (!session) {
    return null;
  }

  const workerBaseURL = process.env.SKILLY_WORKER_BASE_URL ?? DEFAULT_WORKER_BASE_URL;
  const url = new URL("/entitlement", workerBaseURL);
  url.searchParams.set("user_id", session.userId);
  const response = await fetch(url, {
    headers: { authorization },
  }).catch(() => null);

  if (!response || response.status !== 200) {
    return null;
  }
  return session;
}

export function selectMacOpenAIAPIKey(): string {
  return process.env.OPENAI_API_KEY_MAC ?? process.env.OPENAI_API_KEY ?? "";
}

export async function getMacEntitlement(userId: string): Promise<MacEntitlementRecord | null> {
  const databaseUrl = getDatabaseUrl();
  if (!databaseUrl) {
    return null;
  }
  const pool = new Pool({ connectionString: databaseUrl });
  try {
    const result = await pool.query<MacEntitlementRecord>(
      `SELECT user_id, status, entitlement_type, period_start, period_end, plan, polar_customer_id
         FROM mac_entitlements
        WHERE user_id = $1`,
      [userId],
    );
    return result.rows[0] ?? null;
  } catch (error) {
    if (isUndefinedTableError(error)) {
      return null;
    }
    throw error;
  } finally {
    await pool.end();
  }
}

export async function upsertMacEntitlement(input: {
  userId: string;
  email?: string | null;
  status: "active" | "canceled" | "none";
  entitlementType: "relay" | "byok";
  periodStart?: string | null;
  periodEnd?: string | null;
  plan?: string | null;
  polarCustomerId?: string | null;
}): Promise<void> {
  const databaseUrl = getDatabaseUrl();
  if (!databaseUrl) {
    return;
  }
  const pool = new Pool({ connectionString: databaseUrl });
  try {
    await pool.query(
      `INSERT INTO mac_entitlements (
         user_id, email, status, entitlement_type, period_start, period_end, plan, polar_customer_id, updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
       ON CONFLICT (user_id) DO UPDATE SET
         email = COALESCE(EXCLUDED.email, mac_entitlements.email),
         status = EXCLUDED.status,
         entitlement_type = EXCLUDED.entitlement_type,
         period_start = EXCLUDED.period_start,
         period_end = EXCLUDED.period_end,
         plan = EXCLUDED.plan,
         polar_customer_id = COALESCE(EXCLUDED.polar_customer_id, mac_entitlements.polar_customer_id),
         updated_at = now()`,
      [
        input.userId,
        input.email ?? null,
        input.status,
        input.entitlementType,
        input.periodStart ?? null,
        input.periodEnd ?? null,
        input.plan ?? null,
        input.polarCustomerId ?? null,
      ],
    );
  } catch (error) {
    if (!isUndefinedTableError(error) && !isUndefinedColumnError(error)) {
      throw error;
    }
  } finally {
    await pool.end();
  }
}

export async function recordMacUsage(input: {
  userId: string;
  email: string;
  seconds: number;
  result?: string | null;
  source?: string | null;
  model?: string | null;
  audioInputTokens?: number | null;
  audioOutputTokens?: number | null;
  textInputTokens?: number | null;
  textOutputTokens?: number | null;
  cachedInputTokens?: number | null;
  totalTokens?: number | null;
  estimatedCostUsd?: string | null;
}): Promise<void> {
  const databaseUrl = getDatabaseUrl();
  if (!databaseUrl) {
    return;
  }
  const seconds = Math.max(0, Math.min(MAC_USAGE_MAX_SECONDS, Math.round(input.seconds)));
  const result = input.result?.slice(0, 64) ?? null;
  const source = input.source?.slice(0, 32) ?? null;
  const model = input.model?.slice(0, 64) ?? null;
  const pool = new Pool({ connectionString: databaseUrl });
  try {
    await pool.query(
      `INSERT INTO mac_usage_events (
         user_id, email, seconds, result, source, model,
         audio_input_tokens, audio_output_tokens, text_input_tokens, text_output_tokens,
         cached_input_tokens, total_tokens, estimated_cost_usd
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        input.userId,
        input.email,
        seconds,
        result,
        source,
        model,
        nullableNonNegativeInt(input.audioInputTokens),
        nullableNonNegativeInt(input.audioOutputTokens),
        nullableNonNegativeInt(input.textInputTokens),
        nullableNonNegativeInt(input.textOutputTokens),
        nullableNonNegativeInt(input.cachedInputTokens),
        nullableNonNegativeInt(input.totalTokens),
        input.estimatedCostUsd?.slice(0, 32) ?? null,
      ],
    );
  } catch (error) {
    if (!isUndefinedTableError(error) && !isUndefinedColumnError(error)) {
      throw error;
    }
  } finally {
    await pool.end();
  }
}

function nullableNonNegativeInt(value: number | null | undefined): number | null {
  if (!Number.isFinite(value)) {
    return null;
  }
  return Math.max(0, Math.round(value as number));
}

function isUndefinedTableError(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "42P01");
}

function isUndefinedColumnError(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "42703");
}
