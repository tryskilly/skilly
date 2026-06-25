// Client for the Skilly web backend (apps/web-backend, Phase 8.4). Fetches the
// ephemeral OpenAI Realtime token the widget connects with, and the tenant's
// compiled SKILL.md. The raw OpenAI key never reaches the browser.
//
// `fetchImpl` is injectable so the client is unit-testable without a network.

export interface SessionToken {
  clientSecret: string;
  model: string;
  expiresAt: number | null;
}

export class BackendError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "BackendError";
  }
}

interface ClientOptions {
  backendUrl: string;
  publishableKey: string;
  endUserId?: string;
  fetchImpl?: typeof fetch;
}

function endpoint(backendUrl: string, path: string): string {
  return `${backendUrl.replace(/\/$/, "")}${path}`;
}

/** POST /api/web/token → ephemeral Realtime client secret for this tenant. */
export async function fetchSessionToken(options: ClientOptions): Promise<SessionToken> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(endpoint(options.backendUrl, "/api/web/token"), {
    method: "POST",
    headers: { "X-Skilly-Key": options.publishableKey },
  });

  if (!response.ok) {
    throw new BackendError(`token endpoint returned ${response.status}`, response.status);
  }

  const payload = (await response.json()) as {
    clientSecret?: string;
    model?: string;
    expiresAt?: number | null;
  };
  if (!payload.clientSecret) {
    throw new BackendError("token response missing clientSecret", response.status);
  }
  return {
    clientSecret: payload.clientSecret,
    model: payload.model ?? "gpt-realtime",
    expiresAt: payload.expiresAt ?? null,
  };
}

/** POST /api/web/usage → meter the session's seconds (best-effort; never throws). */
export async function reportSessionUsage(
  options: ClientOptions & { seconds: number },
): Promise<void> {
  const fetchImpl = options.fetchImpl ?? fetch;
  try {
    await fetchImpl(endpoint(options.backendUrl, "/api/web/usage"), {
      method: "POST",
      headers: { "X-Skilly-Key": options.publishableKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        seconds: Math.max(0, Math.round(options.seconds)),
        endUserId: options.endUserId,
      }),
    });
  } catch {
    // Metering is best-effort; a failed report must not disrupt the user.
  }
}

/** GET /api/web/skill?skill=<id> → the tenant's compiled SKILL.md, or null if absent. */
export async function fetchTenantSkill(
  options: ClientOptions & { skillId: string },
): Promise<string | null> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const url = endpoint(options.backendUrl, `/api/web/skill?skill=${encodeURIComponent(options.skillId)}`);
  const response = await fetchImpl(url, { headers: { "X-Skilly-Key": options.publishableKey } });

  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new BackendError(`skill endpoint returned ${response.status}`, response.status);
  }
  const payload = (await response.json()) as { content?: string };
  return payload.content ?? null;
}
