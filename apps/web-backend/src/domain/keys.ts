// API key model. Publishable keys (pk_) ship in the widget and are origin-locked;
// secret keys (sk_) are server-to-server and never leave the backend. Only a
// sha256 hash is ever stored — raw keys are shown once at creation (Phase 8.5).

import { createHash, randomBytes } from "node:crypto";

export type KeyType = "publishable" | "secret";

export const PUBLISHABLE_PREFIX = "pk_";
export const SECRET_PREFIX = "sk_";

// pk_live_<24+ url-safe chars> / sk_live_<...>. `live` is the environment label.
const KEY_PATTERN = /^(pk|sk)_(live|test)_[A-Za-z0-9]{24,}$/;

export function keyType(rawKey: string): KeyType | null {
  if (rawKey.startsWith(PUBLISHABLE_PREFIX)) return "publishable";
  if (rawKey.startsWith(SECRET_PREFIX)) return "secret";
  return null;
}

export function isValidKeyFormat(rawKey: string): boolean {
  return KEY_PATTERN.test(rawKey);
}

/** Stable lookup hash for a key. Never store or log the raw key. */
export function hashKey(rawKey: string): string {
  return createHash("sha256").update(rawKey).digest("hex");
}

/** Display fields for a key (safe to store/show): e.g. { prefix: "pk_live", last4: "9f2a" }. */
export function keyDisplay(rawKey: string): { prefix: string; last4: string } {
  const segments = rawKey.split("_");
  const prefix = segments.length >= 2 ? `${segments[0]}_${segments[1]}` : segments[0] ?? "";
  return { prefix, last4: rawKey.slice(-4) };
}

/** Generate a new key (used by the dashboard in Phase 8.5; here for seeding/tests). */
export function generateKey(type: KeyType, environment: "live" | "test" = "live"): string {
  const prefix = type === "publishable" ? PUBLISHABLE_PREFIX : SECRET_PREFIX;
  // hex keeps the random part within [a-f0-9] so it matches KEY_PATTERN
  // (base64url would include '-'/'_', which the strict format disallows).
  const random = randomBytes(24).toString("hex");
  return `${prefix}${environment}_${random}`;
}
