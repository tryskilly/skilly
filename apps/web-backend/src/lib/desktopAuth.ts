import { base64UrlEncodeJson, signToken } from "./signedToken";

export const DESKTOP_SESSION_ISSUER = "skilly-studio";
export const DESKTOP_SESSION_AUDIENCE = "skilly-desktop";
export const DESKTOP_SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

export interface DesktopAuthUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
}

export interface DesktopAuthResponse {
  user: DesktopAuthUser;
  accessToken: string;
  refreshToken: string | null;
  sessionToken: string;
}

export class DesktopAuthUpstreamError extends Error {
  constructor(readonly status: number, message = "WorkOS authentication failed") {
    super(message);
    this.name = "DesktopAuthUpstreamError";
  }
}

export function isValidDesktopOAuthState(value: string | null | undefined): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{16,256}$/.test(value);
}

export function desktopRedirectUri(requestOrigin?: string): string {
  const configured = process.env.WORKOS_MAC_REDIRECT_URI;
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error("WORKOS_MAC_REDIRECT_URI is required in production");
  }
  return new URL("/api/mac/auth/callback", requestOrigin ?? "http://localhost:4310").toString();
}

export function buildDesktopAuthorizeUrl(state: string, requestOrigin?: string): string {
  if (!isValidDesktopOAuthState(state)) throw new Error("Invalid OAuth state");
  if (!process.env.WORKOS_CLIENT_ID) throw new Error("WORKOS_CLIENT_ID is not configured");
  const url = new URL("https://api.workos.com/user_management/authorize");
  url.searchParams.set("client_id", process.env.WORKOS_CLIENT_ID);
  url.searchParams.set("redirect_uri", desktopRedirectUri(requestOrigin));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("provider", "authkit");
  url.searchParams.set("state", state);
  return url.toString();
}

function parseUser(data: Record<string, unknown>): DesktopAuthUser {
  const raw = data.user;
  if (!raw || typeof raw !== "object") throw new DesktopAuthUpstreamError(502, "WorkOS response missing user");
  const user = raw as Record<string, unknown>;
  if (typeof user.id !== "string" || typeof user.email !== "string" || !user.email) {
    throw new DesktopAuthUpstreamError(502, "WorkOS response missing user identity");
  }
  return {
    id: user.id,
    email: user.email,
    firstName: typeof user.first_name === "string" ? user.first_name : typeof user.firstName === "string" ? user.firstName : null,
    lastName: typeof user.last_name === "string" ? user.last_name : typeof user.lastName === "string" ? user.lastName : null,
  };
}

async function authenticate(payload: Record<string, string>): Promise<DesktopAuthResponse> {
  if (!process.env.WORKOS_CLIENT_ID || !process.env.WORKOS_API_KEY || !process.env.SESSION_TOKEN_SECRET) {
    throw new Error("WorkOS authentication is not configured");
  }
  const response = await fetch("https://api.workos.com/user_management/authenticate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ client_id: process.env.WORKOS_CLIENT_ID, client_secret: process.env.WORKOS_API_KEY, ...payload }),
  });
  if (!response.ok) throw new DesktopAuthUpstreamError(response.status);
  const data = (await response.json()) as Record<string, unknown>;
  const user = parseUser(data);
  const accessToken = typeof data.access_token === "string" ? data.access_token : null;
  if (!accessToken) throw new DesktopAuthUpstreamError(502, "WorkOS response missing access token");
  return {
    user,
    accessToken,
    refreshToken: typeof data.refresh_token === "string" ? data.refresh_token : null,
    sessionToken: mintDesktopSessionToken(user),
  };
}

export function mintDesktopSessionToken(user: DesktopAuthUser): string {
  const secret = process.env.SESSION_TOKEN_SECRET;
  if (!secret) throw new Error("SESSION_TOKEN_SECRET is not configured");
  const issuedAt = Math.floor(Date.now() / 1000);
  const header = base64UrlEncodeJson({ alg: "HS256", typ: "JWT" });
  const payload = base64UrlEncodeJson({ sub: user.id, email: user.email, iat: issuedAt, exp: issuedAt + DESKTOP_SESSION_TTL_SECONDS, iss: DESKTOP_SESSION_ISSUER, aud: DESKTOP_SESSION_AUDIENCE });
  return `${header}.${payload}.${signToken(`${header}.${payload}`, secret)}`;
}

export function exchangeDesktopCode(code: string): Promise<DesktopAuthResponse> {
  return authenticate({ grant_type: "authorization_code", code });
}

export function refreshDesktopSession(refreshToken: string): Promise<DesktopAuthResponse> {
  return authenticate({ grant_type: "refresh_token", refresh_token: refreshToken });
}
