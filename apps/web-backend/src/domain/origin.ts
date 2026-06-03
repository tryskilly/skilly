// Origin allowlisting. A publishable key is public, so the defense against key
// theft is binding it to the tenant's own origins. Supports an exact origin
// ("https://acme.com") or a single wildcard subdomain label
// ("https://*.acme.com" matches "https://app.acme.com" but NOT "https://acme.com"
// or a different registrable domain).

/** Lowercase the scheme+host, drop any path/trailing slash. Returns null if unparseable. */
export function normalizeOrigin(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.host}`.toLowerCase();
  } catch {
    return null;
  }
}

function matchesEntry(origin: string, entry: string): boolean {
  const normalizedEntry = normalizeOrigin(entry.replace("*.", "wildcard-placeholder."));
  if (!normalizedEntry) {
    return false;
  }

  if (!entry.includes("*.")) {
    return origin === normalizedEntry;
  }

  // Wildcard: compare scheme, then require the origin host to be a strict
  // subdomain of the entry's base domain.
  const originUrl = safeUrl(origin);
  const entryUrl = safeUrl(normalizedEntry);
  if (!originUrl || !entryUrl) {
    return false;
  }
  if (originUrl.protocol !== entryUrl.protocol) {
    return false;
  }
  const baseHost = entryUrl.host.replace("wildcard-placeholder.", "");
  return originUrl.host.endsWith(`.${baseHost}`);
}

/** True when `origin` is permitted by any entry in the allowlist. */
export function matchOrigin(origin: string | null | undefined, allowlist: string[]): boolean {
  const normalizedOrigin = normalizeOrigin(origin);
  if (!normalizedOrigin || allowlist.length === 0) {
    return false;
  }
  return allowlist.some((entry) => matchesEntry(normalizedOrigin, entry));
}

function safeUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}
