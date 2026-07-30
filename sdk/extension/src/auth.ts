// WorkOS login for the extension. WORKOS_CLIENT_ID is a public identifier (safe to bake into
// extension config, the same way a tenant's publishable key works for @skilly/web) — the actual
// secret (WORKOS_API_KEY) never leaves the backend. The background entrypoint calls
// browser.identity.launchWebAuthFlow with the URL this builds, captures the `code` from the
// redirect, and POSTs it to /api/extension/auth/exchange via exchangeCodeForSession.
export function buildWorkOSAuthorizeUrl(clientId: string, redirectUri: string): string {
  const url = new URL("https://api.workos.com/user_management/authorize");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("provider", "authkit");
  return url.toString();
}

export interface ExtensionSessionResult {
  sessionToken: string;
  expiresAt: number;
  email: string;
}

export async function exchangeCodeForSession(backendUrl: string, code: string): Promise<ExtensionSessionResult> {
  const response = await fetch(`${backendUrl.replace(/\/$/, "")}/api/extension/auth/exchange`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code }),
  });
  if (!response.ok) {
    // Deliberately reports only the status: `code` is a single-use credential that grants a
    // session, and must not end up in a log line or an error report.
    throw new Error(`extension auth exchange failed with ${response.status}`);
  }
  return (await response.json()) as ExtensionSessionResult;
}
