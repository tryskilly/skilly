import { signToken, signaturesMatch, decodeBase64UrlJson } from "./signedToken";
import { getDatabaseUrl } from "@/db";
import { Pool, type PoolClient } from "pg";
import {
  decidePersonalAccess,
  normalizeLegacyTrialSeconds,
  PERSONAL_TRIAL_SECONDS,
  isTrustedRelayAdmin,
  type PersonalAccessDecision,
  type PersonalAccessMode,
  type PersonalAccessSource,
  type PersonalEntitlementStatus,
} from "@/domain/personalAccess";

export interface MacSession {
  userId: string;
  email: string;
  issuedAt: number;
  expiresAt: number;
}

export interface MacEntitlementRecord {
  user_id: string;
  status: PersonalEntitlementStatus;
  entitlement_type?: "relay" | "byok" | null;
  period_start?: string | null;
  period_end?: string | null;
  plan?: string | null;
  polar_customer_id?: string | null;
  trial_seconds_used?: number;
  trial_migration_state?: "unknown" | "recorded";
  trial_migrated_at?: string | null;
}

export interface HostedAccessSession {
  sessionId: string;
  source: PersonalAccessSource;
  accessMode: PersonalAccessMode;
  remainingSeconds: number | null;
  periodStart: string | null;
  periodEnd: string | null;
}

export type HostedAccessPreflight =
  | ({ allowed: true } & HostedAccessSession)
  | ({ allowed: false } & Extract<PersonalAccessDecision, { allowed: false }>);

export class InvalidUsageSessionError extends Error {
  constructor(message = "unknown or mismatched usage session") {
    super(message);
    this.name = "InvalidUsageSessionError";
  }
}

const MAC_SESSION_ISSUER = "skilly-studio";
const MAC_SESSION_AUDIENCE = "skilly-desktop";
const MAC_USAGE_MAX_SECONDS = 3600;

function sessionSecret(): string | null {
  const secret = process.env.SESSION_TOKEN_SECRET;
  if (!secret) {
    return null;
  }
  return secret;
}

function signPayload(payload: string): string | null {
  const secret = sessionSecret();
  return secret ? signToken(payload, secret) : null;
}

export function verifyMacSessionToken(token: string): MacSession | null {
  const segments = token.split(".");
  if (segments.length !== 3) return null;
  const [encodedHeader, encodedPayload, signature] = segments;
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
    // Verify old signed sessions locally during the client update window.
    // This does not consult or depend on the retired Worker.
    (payload?.iss !== MAC_SESSION_ISSUER && payload?.iss !== "skilly-proxy") ||
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

export function selectMacOpenAIAPIKey(): string {
  return process.env.OPENAI_API_KEY_MAC ?? process.env.OPENAI_API_KEY ?? "";
}

// Preserve the desktop development canary contract without permitting arbitrary models.
export function selectMacRealtimeModel(requested: string | null): string | undefined {
  return requested && ["gpt-realtime", "gpt-realtime-2.1", "gpt-realtime-2.1-mini"].includes(requested)
    ? requested : undefined;
}

/**
 * Authorize the beginning of a hosted Realtime session and bind its usage reports to a
 * server-issued session row. This is deliberately a start gate: it does not reserve a future
 * duration and cannot terminate a direct OpenAI connection after the token is minted.
 */
export async function authorizeHostedAccess(input: {
  userId: string;
  email: string;
  source: PersonalAccessSource;
  legacyTrialSecondsUsed?: unknown;
  migrationMarker?: string | null;
}): Promise<HostedAccessPreflight> {
  const databaseUrl = getDatabaseUrl();
  if (!databaseUrl) {
    throw new Error("Studio database is not configured");
  }
  const pool = new Pool({ connectionString: databaseUrl });
  let client: PoolClient | null = null;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO mac_entitlements (user_id, email, status, entitlement_type, trial_seconds_used, trial_migration_state, updated_at)
       VALUES ($1, $2, 'none', 'relay', 0, 'unknown', now())
       ON CONFLICT (user_id) DO NOTHING`,
      [input.userId, input.email],
    );
    const entitlement = (await client.query<{
      status: string;
      entitlement_type: string | null;
      period_start: string | null;
      period_end: string | null;
      trial_seconds_used: number;
      trial_migration_state: string;
    }>(
      `SELECT status, entitlement_type, period_start, period_end, trial_seconds_used, trial_migration_state
         FROM mac_entitlements WHERE user_id = $1 FOR UPDATE`,
      [input.userId],
    )).rows[0];
    if (!entitlement) {
      throw new Error("Studio entitlement row was not created");
    }

    const status = normalizeEntitlementStatus(entitlement.status);
    const periodStart = entitlement.period_start;
    const periodEnd = entitlement.period_end;
    const paid = entitlement.entitlement_type !== "byok" &&
      (status === "active" || (status === "canceled" && futureDate(periodEnd)));
    const isAdmin = input.source === "relay" && isTrustedRelayAdmin(input.userId);
    let trialSecondsUsed = Math.max(0, Math.round(entitlement.trial_seconds_used || 0));
    const migrationMarker = input.migrationMarker === "v1";
    const legacyFloor = normalizeLegacyTrialSeconds(input.legacyTrialSecondsUsed);

    // Unknown pre-cutover rows are treated conservatively. This prevents an old account with
    // usage but no local marker from silently regaining a full trial after a migration.
    if (entitlement.trial_migration_state !== "recorded") {
      const legacyUsage = await client.query<{ total: string | null }>(
        `SELECT COALESCE(SUM(CASE WHEN source IS DISTINCT FROM 'byok' THEN seconds ELSE 0 END), 0)::text AS total
           FROM mac_usage_events WHERE user_id = $1`,
        [input.userId],
      );
      const conservativeFloor = Math.min(PERSONAL_TRIAL_SECONDS, Number(legacyUsage.rows[0]?.total ?? 0));
      const nextTrialSeconds = Math.max(trialSecondsUsed, conservativeFloor, legacyFloor ?? 0);
      if (migrationMarker && input.source === "relay") {
        await client.query(
          `UPDATE mac_entitlements
              SET trial_seconds_used = $2, trial_migration_state = 'recorded', trial_migrated_at = now(), updated_at = now()
            WHERE user_id = $1`,
          [input.userId, nextTrialSeconds],
        );
        trialSecondsUsed = nextTrialSeconds;
      } else {
        trialSecondsUsed = nextTrialSeconds;
      }
    }

    if (!isAdmin && paid && (!periodStart || !Number.isFinite(Date.parse(periodStart)))) {
      throw new Error("Canonical billing period is unavailable");
    }
    const paidSecondsUsed = paid ? await getHostedUsageSeconds(client, input.userId, periodStart!, periodEnd) : 0;
    const decision = decidePersonalAccess({
      source: input.source,
      status,
      entitlementType: entitlement.entitlement_type,
      periodEnd,
      trialSecondsUsed,
      paidSecondsUsed,
      migrationState: entitlement.trial_migration_state === "recorded" || (migrationMarker && input.source === "relay") ? "recorded" : "unknown",
      migrationMarkerPresent: migrationMarker && input.source === "relay",
      isTrustedRelayAdmin: isAdmin,
    });
    if (!decision.allowed) {
      await client.query("COMMIT");
      return decision;
    }

    const sessionId = crypto.randomUUID();
    await client.query(
      `INSERT INTO mac_access_sessions (session_id, user_id, source, access_mode, period_start, period_end)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [sessionId, input.userId, input.source, decision.accessMode, periodStart, periodEnd],
    );
    await client.query("COMMIT");
    return {
      allowed: true,
      sessionId,
      source: input.source,
      accessMode: decision.accessMode,
      remainingSeconds: decision.remainingSeconds,
      periodStart,
      periodEnd,
    };
  } catch (error) {
      await client?.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client?.release();
    await pool.end();
  }
}

function normalizeEntitlementStatus(value: string): PersonalEntitlementStatus {
  return ["active", "canceled", "past_due", "none", "revoked", "expired"].includes(value)
    ? value as PersonalEntitlementStatus
    : "none";
}

function futureDate(value: string | null): boolean {
  const parsed = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) && parsed > Date.now();
}

async function getHostedUsageSeconds(
  client: PoolClient,
  userId: string,
  periodStart: string | null,
  periodEnd: string | null,
): Promise<number> {
  const end = periodEnd && Number.isFinite(Date.parse(periodEnd));
  const result = await client.query<{ total: string | null }>(
    `SELECT COALESCE(SUM(seconds), 0)::text AS total FROM mac_usage_events
      WHERE user_id = $1 AND source IN ('relay', 'extension')
        AND ((access_mode = 'paid' AND period_start = $2)
          OR (session_id IS NULL AND access_mode IS NULL AND created_at >= $2::timestamptz
            ${end ? "AND created_at < $3::timestamptz" : ""}))`,
    end ? [userId, periodStart, periodEnd] : [userId, periodStart],
  );
  return Math.max(0, Number(result.rows[0]?.total ?? 0));
}

export async function getMacEntitlement(userId: string): Promise<MacEntitlementRecord | null> {
  const databaseUrl = getDatabaseUrl();
  if (!databaseUrl) {
    throw new Error("Studio database is not configured");
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
  } finally {
    await pool.end();
  }
}

export async function upsertMacEntitlement(input: {
  userId: string;
  email?: string | null;
  status: PersonalEntitlementStatus;
  entitlementType: "relay" | "byok";
  periodStart?: string | null;
  periodEnd?: string | null;
  plan?: string | null;
  polarCustomerId?: string | null;
  providerEventAt?: string | null;
  providerEventId?: string | null;
}): Promise<void> {
  const databaseUrl = getDatabaseUrl();
  if (!databaseUrl) {
    throw new Error("Studio database is not configured");
  }
  const pool = new Pool({ connectionString: databaseUrl });
  const providerEventAt = input.providerEventAt && Number.isFinite(Date.parse(input.providerEventAt))
    ? input.providerEventAt
    : null;
  try {
    await pool.query(
      `INSERT INTO mac_entitlements (
         user_id, email, status, entitlement_type, period_start, period_end, plan, polar_customer_id,
         provider_event_at, provider_event_id, updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())
       ON CONFLICT (user_id) DO UPDATE SET
         email = COALESCE(EXCLUDED.email, mac_entitlements.email),
         status = EXCLUDED.status,
         entitlement_type = EXCLUDED.entitlement_type,
         period_start = EXCLUDED.period_start,
         period_end = EXCLUDED.period_end,
         plan = EXCLUDED.plan,
         polar_customer_id = COALESCE(EXCLUDED.polar_customer_id, mac_entitlements.polar_customer_id),
         provider_event_at = EXCLUDED.provider_event_at,
         provider_event_id = EXCLUDED.provider_event_id,
         updated_at = now()
       WHERE mac_entitlements.provider_event_at IS NULL
          OR (EXCLUDED.provider_event_at IS NOT NULL AND EXCLUDED.provider_event_at >= mac_entitlements.provider_event_at)`,
      [
        input.userId,
        input.email ?? null,
        input.status,
        input.entitlementType,
        input.periodStart ?? null,
        input.periodEnd ?? null,
        input.plan ?? null,
        input.polarCustomerId ?? null,
        providerEventAt,
        input.providerEventId ?? null,
      ],
    );
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
  eventId?: string | null;
  sessionId?: string | null;
}): Promise<{ duplicate: boolean; recordedSeconds: number }> {
  const databaseUrl = getDatabaseUrl();
  if (!databaseUrl) {
    throw new Error("Studio database is not configured");
  }
  const numericSeconds = Number(input.seconds);
  const seconds = Number.isFinite(numericSeconds)
    ? Math.max(0, Math.min(MAC_USAGE_MAX_SECONDS, Math.round(numericSeconds)))
    : 0;
  const result = input.result?.slice(0, 64) ?? null;
  let source = input.source?.slice(0, 32) ?? null;
  const model = input.model?.slice(0, 64) ?? null;
  const pool = new Pool({ connectionString: databaseUrl });
  let client: PoolClient | null = null;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    let accessMode: string | null = null;
    let periodStart: string | null = null;
    let periodEnd: string | null = null;
    if (input.sessionId) {
      const session = await client.query<{
        user_id: string;
        source: string;
        access_mode: string;
        period_start: string | null;
        period_end: string | null;
      }>(
        `SELECT user_id, source, access_mode, period_start, period_end
           FROM mac_access_sessions WHERE session_id = $1`,
        [input.sessionId],
      );
      const row = session.rows[0];
      if (!row || row.user_id !== input.userId || (source && source !== row.source)) {
        throw new InvalidUsageSessionError();
      }
      source = row.source;
      accessMode = row.access_mode;
      periodStart = row.period_start;
      periodEnd = row.period_end;
    }
    const insertResult = await client.query(
      `INSERT INTO mac_usage_events (
         user_id, email, seconds, result, source, model,
         audio_input_tokens, audio_output_tokens, text_input_tokens, text_output_tokens,
         cached_input_tokens, total_tokens, estimated_cost_usd,
         event_id, session_id, access_mode, period_start, period_end
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
       ON CONFLICT (user_id, event_id) DO NOTHING
       RETURNING id`,
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
        input.eventId ?? null,
        input.sessionId ?? null,
        accessMode,
        periodStart,
        periodEnd,
      ],
    );
    if (insertResult.rowCount === 0) {
      await client.query("COMMIT");
      return { duplicate: true, recordedSeconds: 0 };
    }
    if (accessMode === "trial") {
      await client.query(
        `UPDATE mac_entitlements
            SET trial_seconds_used = LEAST($2, trial_seconds_used + $3), updated_at = now()
          WHERE user_id = $1`,
        [input.userId, PERSONAL_TRIAL_SECONDS, seconds],
      );
    }
    await client.query("COMMIT");
    return { duplicate: false, recordedSeconds: seconds };
  } catch (error) {
    await client?.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client?.release();
    await pool.end();
  }
}

function nullableNonNegativeInt(value: number | null | undefined): number | null {
  if (!Number.isFinite(value)) {
    return null;
  }
  return Math.max(0, Math.round(value as number));
}
