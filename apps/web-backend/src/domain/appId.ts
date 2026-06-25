// App-id allowlisting for the mobile B2B SDK (Phase 9.0). A native request
// (iOS bundle id / Android package name) is the mobile analog of a web origin.
//
// SECURITY NOTE: unlike a browser-enforced `Origin`, a native client *self-reports*
// its app id (it can claim any value). So app-id allowlisting is a soft gate — it
// stops casual key reuse, but strong per-app binding requires platform attestation
// (App Attest on iOS, Play Integrity on Android), which is a follow-up. The auth
// path therefore only consults the app-id allowlist when no browser `Origin` is
// present (see tenantService), so a web caller can never bypass origin checks via
// a spoofed app-id header.

/** Trim an app id; null if empty. */
export function normalizeAppId(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function matchesEntry(appId: string, entry: string): boolean {
  const normalizedEntry = entry.trim();
  // A trailing ".*" matches the base id and any sub-id, e.g. "com.acme.*"
  // matches "com.acme" and "com.acme.beta" but not "com.acmecorp".
  if (normalizedEntry.endsWith(".*")) {
    const base = normalizedEntry.slice(0, -2);
    return appId === base || appId.startsWith(`${base}.`);
  }
  return appId === normalizedEntry;
}

/** True when `appId` is permitted by any entry in the allowlist. */
export function matchAppId(appId: string | null | undefined, allowlist: string[]): boolean {
  const normalized = normalizeAppId(appId);
  if (!normalized || allowlist.length === 0) {
    return false;
  }
  return allowlist.some((entry) => matchesEntry(normalized, entry));
}
