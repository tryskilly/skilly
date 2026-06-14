import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export type DashboardRole = "tenant_admin" | "super_admin";

export interface DashboardSession {
  role: DashboardRole;
  tenantId: string;
  issuedAt: number;
  workosUserId?: string;
  email?: string | null;
  workosOrganizationId?: string | null;
}

export const DASHBOARD_SESSION_COOKIE = "skilly_dashboard_session";
const SESSION_TTL_SECONDS = 60 * 60 * 8;

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

function getConfiguredPassword(): string | null {
  return process.env.SKILLY_DASHBOARD_PASSWORD ?? (isProduction() ? null : "skilly-local");
}

function getSigningSecret(): string | null {
  return process.env.SKILLY_DASHBOARD_SESSION_SECRET ?? getConfiguredPassword();
}

export function isDashboardAuthConfigured(): boolean {
  return Boolean(getConfiguredPassword() && getSigningSecret());
}

export function dashboardAuthModeLabel(): string {
  if (isWorkOSDashboardAuthConfigured()) {
    return "WorkOS AuthKit";
  }
  if (!getConfiguredPassword()) {
    return "Missing password";
  }
  if (!process.env.SKILLY_DASHBOARD_PASSWORD && !isProduction()) {
    return "Local default password";
  }
  return "Password protected";
}

export function isWorkOSDashboardAuthConfigured(): boolean {
  return Boolean(
    process.env.WORKOS_CLIENT_ID &&
      process.env.WORKOS_API_KEY &&
      process.env.WORKOS_DASHBOARD_REDIRECT_URI &&
      getSigningSecret(),
  );
}

export function configuredDashboardRole(): DashboardRole {
  return process.env.SKILLY_DASHBOARD_ROLE === "tenant_admin" ? "tenant_admin" : "super_admin";
}

export function verifyDashboardPassword(password: string): boolean {
  const configured = getConfiguredPassword();
  if (!configured) {
    return false;
  }
  const given = Buffer.from(password);
  const expected = Buffer.from(configured);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

function base64UrlEncode(value: string): string {
  return Buffer.from(value).toString("base64url");
}

function base64UrlDecode(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signPayload(payload: string): string {
  const secret = getSigningSecret();
  if (!secret) {
    throw new Error("Dashboard auth is not configured");
  }
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function signaturesMatch(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function serializeDashboardSession(session: DashboardSession): string {
  const payload = base64UrlEncode(JSON.stringify(session));
  return `${payload}.${signPayload(payload)}`;
}

export function parseDashboardSession(rawValue: string | undefined): DashboardSession | null {
  if (!rawValue) {
    return null;
  }
  const [payload, signature] = rawValue.split(".");
  if (!payload || !signature || !signaturesMatch(signature, signPayload(payload))) {
    return null;
  }
  try {
    const parsed = JSON.parse(base64UrlDecode(payload)) as Partial<DashboardSession>;
    if (
      (parsed.role !== "tenant_admin" && parsed.role !== "super_admin") ||
      typeof parsed.tenantId !== "string" ||
      typeof parsed.issuedAt !== "number"
    ) {
      return null;
    }
    if (Date.now() - parsed.issuedAt > SESSION_TTL_SECONDS * 1000) {
      return null;
    }
    return {
      role: parsed.role,
      tenantId: parsed.tenantId,
      issuedAt: parsed.issuedAt,
      workosUserId: typeof parsed.workosUserId === "string" ? parsed.workosUserId : undefined,
      email: typeof parsed.email === "string" || parsed.email === null ? parsed.email : undefined,
      workosOrganizationId:
        typeof parsed.workosOrganizationId === "string" || parsed.workosOrganizationId === null
          ? parsed.workosOrganizationId
          : undefined,
    };
  } catch {
    return null;
  }
}

export async function getDashboardSession(): Promise<DashboardSession | null> {
  const cookieStore = await cookies();
  return parseDashboardSession(cookieStore.get(DASHBOARD_SESSION_COOKIE)?.value);
}

export async function setDashboardSession(session: DashboardSession): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(DASHBOARD_SESSION_COOKIE, serializeDashboardSession(session), {
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction(),
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function clearDashboardSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(DASHBOARD_SESSION_COOKIE);
}

export async function requireDashboardSession(requiredRole?: DashboardRole): Promise<DashboardSession> {
  const session = await getDashboardSession();
  if (!session) {
    redirect("/login?next=/dashboard");
  }
  if (requiredRole === "super_admin" && session.role !== "super_admin") {
    redirect("/dashboard");
  }
  return session;
}
