import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { DashboardMembership, WebBackendRepo } from "@/db/repo";
import { getDefaultTenantId } from "./session";

export const WORKOS_STATE_COOKIE = "skilly_workos_oauth_state";
export const WORKOS_MAGIC_EMAIL_COOKIE = "skilly_workos_magic_email";
const STATE_TTL_SECONDS = 10 * 60;
const MAGIC_EMAIL_TTL_SECONDS = 10 * 60;

export interface WorkOSStatePayload {
  nonce: string;
  nextPath: string;
  issuedAt: number;
  /**
   * "signin" (default) — resolve an existing membership, fail with no_membership if none.
   * "signup" — when no membership exists, create a tenant + super_admin membership
   *   for this WorkOS user and route to onboarding. Existing members signing in via
   *   the signup entry still just sign in normally.
   */
  intent: "signin" | "signup";
}

export interface WorkOSMagicEmailPayload {
  email: string;
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

export type WorkOSAuthMethod = "email" | "google";

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

function signedCookieValue(payload: unknown): string {
  const encoded = base64UrlEncodeJson(payload);
  return `${encoded}.${signPayload(encoded)}`;
}

function parseSignedCookieValue<T>(rawValue: string | undefined): T | null {
  if (!rawValue) {
    return null;
  }
  const [encoded, signature] = rawValue.split(".");
  if (!encoded || !signature || !signaturesMatch(signature, signPayload(encoded))) {
    return null;
  }
  try {
    return base64UrlDecodeJson<T>(encoded);
  } catch {
    return null;
  }
}

export function safeDashboardNextPath(value: string | null | undefined): string {
  // Allow both /dashboard and /onboarding next-paths (signup routes to onboarding).
  if (value?.startsWith("/dashboard") || value?.startsWith("/onboarding")) {
    return value;
  }
  return "/dashboard";
}

export function parseWorkOSAuthMethod(value: string | null | undefined): WorkOSAuthMethod {
  return value === "google" ? "google" : "email";
}

export function createWorkOSState(
  nextPath: string,
  intent: "signin" | "signup" = "signin",
): { state: string; cookieValue: string; maxAge: number } {
  const payload: WorkOSStatePayload = {
    nonce: randomBytes(24).toString("base64url"),
    nextPath: safeDashboardNextPath(nextPath),
    issuedAt: Date.now(),
    intent,
  };
  return {
    state: payload.nonce,
    cookieValue: signedCookieValue(payload),
    maxAge: STATE_TTL_SECONDS,
  };
}

export function parseWorkOSStateCookie(rawValue: string | undefined): WorkOSStatePayload | null {
  const payload = parseSignedCookieValue<Partial<WorkOSStatePayload>>(rawValue);
  if (
    !payload ||
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
    intent: payload.intent === "signup" ? "signup" : "signin",
  };
}

export function normalizeWorkOSEmail(value: string | null | undefined): string | null {
  const email = value?.trim().toLowerCase();
  if (!email || email.length > 254) {
    return null;
  }
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

export function createWorkOSMagicEmailCookie(
  email: string,
  nextPath: string,
): { cookieValue: string; maxAge: number } {
  const normalizedEmail = normalizeWorkOSEmail(email);
  if (!normalizedEmail) {
    throw new Error("Invalid email");
  }
  return {
    cookieValue: signedCookieValue({
      email: normalizedEmail,
      nextPath: safeDashboardNextPath(nextPath),
      issuedAt: Date.now(),
    } satisfies WorkOSMagicEmailPayload),
    maxAge: MAGIC_EMAIL_TTL_SECONDS,
  };
}

export function parseWorkOSMagicEmailCookie(rawValue: string | undefined): WorkOSMagicEmailPayload | null {
  const payload = parseSignedCookieValue<Partial<WorkOSMagicEmailPayload>>(rawValue);
  if (
    !payload ||
    typeof payload.email !== "string" ||
    typeof payload.nextPath !== "string" ||
    typeof payload.issuedAt !== "number"
  ) {
    return null;
  }
  const email = normalizeWorkOSEmail(payload.email);
  if (!email || Date.now() - payload.issuedAt > MAGIC_EMAIL_TTL_SECONDS * 1000) {
    return null;
  }
  return {
    email,
    nextPath: safeDashboardNextPath(payload.nextPath),
    issuedAt: payload.issuedAt,
  };
}

export function buildWorkOSAuthorizeUrl(state: string, method: WorkOSAuthMethod = "email"): string {
  if (!isWorkOSAuthConfigured()) {
    throw new Error("WorkOS dashboard auth is not configured");
  }
  const authUrl = new URL("https://api.workos.com/user_management/authorize");
  authUrl.searchParams.set("client_id", process.env.WORKOS_CLIENT_ID!);
  authUrl.searchParams.set("redirect_uri", process.env.WORKOS_DASHBOARD_REDIRECT_URI!);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("provider", method === "google" ? "GoogleOAuth" : "authkit");
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

function parseWorkOSAuthenticateResult(data: Record<string, unknown>): WorkOSAuthResult {
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
  return parseWorkOSAuthenticateResult(data);
}

export async function sendWorkOSMagicAuthCode(email: string): Promise<void> {
  if (!isWorkOSAuthConfigured()) {
    throw new Error("WorkOS dashboard auth is not configured");
  }
  const response = await fetch("https://api.workos.com/user_management/magic_auth", {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.WORKOS_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ email }),
  });

  if (!response.ok) {
    throw new Error(`WorkOS Magic Auth create failed with ${response.status}`);
  }
}

export async function exchangeWorkOSMagicAuthCode(email: string, code: string): Promise<WorkOSAuthResult> {
  if (!isWorkOSAuthConfigured()) {
    throw new Error("WorkOS dashboard auth is not configured");
  }
  const response = await fetch("https://api.workos.com/user_management/authenticate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.WORKOS_CLIENT_ID,
      client_secret: process.env.WORKOS_API_KEY,
      grant_type: "urn:workos:oauth:grant-type:magic-auth:code",
      email,
      code,
    }),
  });

  if (!response.ok) {
    throw new Error(`WorkOS Magic Auth authenticate failed with ${response.status}`);
  }

  const data = (await response.json()) as Record<string, unknown>;
  return parseWorkOSAuthenticateResult(data);
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
