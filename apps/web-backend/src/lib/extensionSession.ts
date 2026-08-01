// Extension-compatible session: mint + verify. Unlike macSession.ts (which only VERIFIES
// tokens the Cloudflare Worker mints), the browser extension has no Worker in its flow at all —
// Studio itself mints this token, right after a WorkOS code exchange. Low-level HMAC sign/verify
// plumbing lives in the shared signedToken.ts (Task 1) — this file owns only the
// extension-specific issuer/audience/expiry semantics, deliberately kept separate from
// macSession.ts's own issuer/audience so a Mac-issued token can never verify as an extension
// session, or vice versa.
import { signToken, signaturesMatch, base64UrlEncodeJson, decodeBase64UrlJson } from "./signedToken";

export interface ExtensionSession {
  userId: string;
  email: string;
  issuedAt: number;
  expiresAt: number;
}

const EXTENSION_SESSION_ISSUER = "skilly-studio";
const EXTENSION_SESSION_AUDIENCE = "skilly-extension";
const EXTENSION_SESSION_TTL_SECONDS = 60 * 60 * 24 * 14; // 14 days — no refresh flow in v1

function sessionSecret(): string | null {
  return process.env.SESSION_TOKEN_SECRET ?? null;
}

function signPayload(payload: string): string | null {
  const secret = sessionSecret();
  return secret ? signToken(payload, secret) : null;
}

export function mintExtensionSessionToken(user: { id: string; email: string }): {
  token: string;
  expiresAt: number;
} {
  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAt = issuedAt + EXTENSION_SESSION_TTL_SECONDS;
  const header = base64UrlEncodeJson({ alg: "HS256" });
  const payload = base64UrlEncodeJson({
    sub: user.id,
    email: user.email,
    iat: issuedAt,
    exp: expiresAt,
    iss: EXTENSION_SESSION_ISSUER,
    aud: EXTENSION_SESSION_AUDIENCE,
  });
  const signature = signPayload(`${header}.${payload}`);
  if (!signature) {
    throw new Error("SESSION_TOKEN_SECRET is not configured");
  }
  return { token: `${header}.${payload}.${signature}`, expiresAt };
}

export function verifyExtensionSessionToken(token: string): ExtensionSession | null {
  const [encodedHeader, encodedPayload, signature] = token.split(".");
  if (!encodedHeader || !encodedPayload || !signature) {
    return null;
  }
  const expectedSignature = signPayload(`${encodedHeader}.${encodedPayload}`);
  if (!expectedSignature || !signaturesMatch(signature, expectedSignature)) {
    return null;
  }
  const payload = decodeBase64UrlJson(encodedPayload);
  const userId = payload?.sub;
  const email = payload?.email;
  const issuedAt = payload?.iat;
  const expiresAt = payload?.exp;
  if (
    typeof userId !== "string" ||
    typeof email !== "string" ||
    typeof issuedAt !== "number" ||
    typeof expiresAt !== "number" ||
    payload?.iss !== EXTENSION_SESSION_ISSUER ||
    payload?.aud !== EXTENSION_SESSION_AUDIENCE ||
    expiresAt <= Math.floor(Date.now() / 1000)
  ) {
    return null;
  }
  return { userId, email, issuedAt, expiresAt };
}

export function authenticateExtensionRequest(request: Request): ExtensionSession | null {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return null;
  }
  const token = authorization.slice("Bearer ".length).trim();
  return token ? verifyExtensionSessionToken(token) : null;
}

export function selectExtensionOpenAIAPIKey(): string {
  return process.env.OPENAI_API_KEY_EXTENSION ?? process.env.OPENAI_API_KEY ?? "";
}
