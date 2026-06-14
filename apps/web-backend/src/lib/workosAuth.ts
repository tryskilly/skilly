import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { DashboardMembership, WebBackendRepo } from "@/db/repo";
import { getDefaultTenantId } from "./session";

export const WORKOS_STATE_COOKIE = "skilly_workos_oauth_state";
const STATE_TTL_SECONDS = 10 * 60;

export interface WorkOSStatePayload {
  nonce: string;
  nextPath: string;
  issuedAt: number;
}

export interface WorkOSUser {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
}

export interface WorkOSAuthResult {
  user: WorkOSUser;
  workosOrganizationId: string | null;
}

export function isWorkOSAuthConfigured(): boolean {
  return Boolean(process.env.WORKOS_CLIENT_ID && process.env.WORKOS_API_KEY && process.env.WORKOS_DASHBOARD_REDIRECT_URI);
}

function signingSecret(): string {
  const secret = process.env.SKILLY_DASHBOARD_SESSION_SECRET ?? process.env.SKILLY_DASHBOARD_PASSWORD;
  if (!secret && process.env.NODE_ENV === "production") {
    throw new Error("SKILLY_DASHBOARD_SESSION_SECRET is required for WorkOS dashboard auth");
  }
  return secret ?? "skilly-local";
}

function signPayload(payload: string): string {
  return createHmac("sha256", signingSecret()).update(payload).digest("base64url");
}

function signaturesMatch(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function base64UrlEncodeJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function base64UrlDecodeJson<T>(value: string): T {
  return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as T;
}

export function safeDashboardNextPath(value: string | null | undefined): string {
  return value?.startsWith("/dashboard") ? value : "/dashboard";
}

export function createWorkOSState(nextPath: string): { state: string; cookieValue: string; maxAge: number } {
  const payload: WorkOSStatePayload = {
    nonce: randomBytes(24).toString("base64url"),
    nextPath: safeDashboardNextPath(nextPath),
    issuedAt: Date.now(),
  };
  const encoded = base64UrlEncodeJson(payload);
  return {
    state: payload.nonce,
    cookieValue: `${encoded}.${signPayload(encoded)}`,
    maxAge: STATE_TTL_SECONDS,
  };
}

export function parseWorkOSStateCookie(rawValue: string | undefined): WorkOSStatePayload | null {
  if (!rawValue) {
    return null;
  }
  const [encoded, signature] = rawValue.split(".");
  if (!encoded || !signature || !signaturesMatch(signature, signPayload(encoded))) {
    return null;
  }
  try {
    const payload = base64UrlDecodeJson<Partial<WorkOSStatePayload>>(encoded);
    if (
      typeof payload.nonce !== "string" ||
      typeof payload.nextPath !== "string" ||
      typeof payload.issuedAt !== "number"
    ) {
      return null;
    }
    if (Date.now() - payload.issuedAt > STATE_TTL_SECONDS * 1000) {
      return null;
    }
    return {
      nonce: payload.nonce,
      nextPath: safeDashboardNextPath(payload.nextPath),
      issuedAt: payload.issuedAt,
    };
  } catch {
    return null;
  }
}

export function buildWorkOSAuthorizeUrl(state: string): string {
  if (!isWorkOSAuthConfigured()) {
    throw new Error("WorkOS dashboard auth is not configured");
  }
  const authUrl = new URL("https://api.workos.com/user_management/authorize");
  authUrl.searchParams.set("client_id", process.env.WORKOS_CLIENT_ID!);
  authUrl.searchParams.set("redirect_uri", process.env.WORKOS_DASHBOARD_REDIRECT_URI!);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("provider", "authkit");
  authUrl.searchParams.set("state", state);
  return authUrl.toString();
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function extractOrganizationId(data: Record<string, unknown>): string | null {
  const direct = asString(data.organization_id) ?? asString(data.organizationId);
  if (direct) {
    return direct;
  }
  const organization = data.organization;
  if (organization && typeof organization === "object") {
    return asString((organization as Record<string, unknown>).id);
  }
  return null;
}

export async function exchangeWorkOSCode(code: string): Promise<WorkOSAuthResult> {
  if (!isWorkOSAuthConfigured()) {
    throw new Error("WorkOS dashboard auth is not configured");
  }
  const response = await fetch("https://api.workos.com/user_management/authenticate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.WORKOS_CLIENT_ID,
      client_secret: process.env.WORKOS_API_KEY,
      grant_type: "authorization_code",
      code,
    }),
  });

  if (!response.ok) {
    throw new Error(`WorkOS authenticate failed with ${response.status}`);
  }

  const data = (await response.json()) as Record<string, unknown>;
  const user = data.user && typeof data.user === "object" ? (data.user as Record<string, unknown>) : null;
  const id = user ? asString(user.id) : null;
  if (!id) {
    throw new Error("WorkOS authenticate response did not include a user id");
  }

  return {
    user: {
      id,
      email: user ? asString(user.email) : null,
      firstName: user ? asString(user.first_name) ?? asString(user.firstName) : null,
      lastName: user ? asString(user.last_name) ?? asString(user.lastName) : null,
    },
    workosOrganizationId: extractOrganizationId(data),
  };
}

export async function resolveDashboardMembership(
  repo: WebBackendRepo,
  auth: WorkOSAuthResult,
): Promise<DashboardMembership | null> {
  const existing = await repo.findDashboardMembership({
    workosUserId: auth.user.id,
    workosOrganizationId: auth.workosOrganizationId,
  });
  if (existing) {
    return existing;
  }

  if (process.env.SKILLY_DASHBOARD_BOOTSTRAP_WORKOS !== "true") {
    return null;
  }

  console.warn("[workos-callback] Bootstrapping first WorkOS dashboard membership", {
    workosUserId: auth.user.id,
    email: auth.user.email,
    workosOrganizationId: auth.workosOrganizationId,
  });

  return repo.upsertDashboardMembership({
    workosUserId: auth.user.id,
    tenantId: getDefaultTenantId(),
    role: "super_admin",
    email: auth.user.email,
    workosOrganizationId: auth.workosOrganizationId,
  });
}
