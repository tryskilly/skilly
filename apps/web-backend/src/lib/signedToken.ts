// Low-level HMAC sign/verify primitives shared by every signed-session token in this codebase
// (macSession.ts for Mac, extensionSession.ts for the browser extension). No issuer/audience/
// expiry semantics here — those stay in each caller, since Mac and the extension use different
// values on purpose (a Mac-issued token must never verify as an extension session, or vice
// versa) and that discrimination is exactly what would be lost by centralizing it here too.
import { createHmac, timingSafeEqual } from "node:crypto";

export function signToken(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function signaturesMatch(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function base64UrlEncodeJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

export function decodeBase64UrlJson(value: string): Record<string, unknown> | null {
  try {
    return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}
