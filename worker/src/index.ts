/**
 * Skilly Proxy Worker
 *
 * Proxies requests to external APIs so the app never ships with raw API keys.
 * Keys are stored as Cloudflare secrets.
 *
 * Routes:
 *   POST /chat              → Anthropic Messages API (streaming)
 *   POST /tts               → ElevenLabs TTS API
 *   POST /transcribe-token  → AssemblyAI streaming token
 *   GET  /auth/url           → Returns WorkOS AuthKit login URL
 *   POST /auth/token         → Exchanges auth code for user profile
 */

interface Env {
  ANTHROPIC_API_KEY: string;
  ELEVENLABS_API_KEY: string;
  ELEVENLABS_VOICE_ID: string;
  ASSEMBLYAI_API_KEY: string;
  WORKOS_API_KEY: string;
  WORKOS_CLIENT_ID: string;
  WORKOS_REDIRECT_URI: string;
  OPENAI_API_KEY: string;
  POLAR_API_KEY: string;
  POLAR_WEBHOOK_SECRET: string;
  POLAR_BETA_PRODUCT_ID: string;
  POLAR_BETA_PRICE_ID: string;
  POLAR_API_BASE: string; // "https://api.polar.sh" or "https://sandbox-api.polar.sh"
  SKILLY_ENTITLEMENTS: {
    get<T>(key: string, type: "json"): Promise<T | null>;
    put(key: string, value: string): Promise<void>;
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    try {
      // POST routes
      if (request.method === "POST") {
        if (url.pathname === "/checkout/create") {
          return await handleCheckoutCreate(request, env);
        }
        if (url.pathname === "/webhooks/polar") {
          return await handlePolarWebhook(request, env);
        }
        if (url.pathname === "/chat") {
          return await handleChat(request, env);
        }
        if (url.pathname === "/tts") {
          return await handleTTS(request, env);
        }
        if (url.pathname === "/transcribe-token") {
          return await handleTranscribeToken(env);
        }
        if (url.pathname === "/auth/token") {
          return await handleAuthToken(request, env);
        }
      }

      // GET routes
      if (request.method === "GET") {
        if (url.pathname === "/entitlement") {
          return await handleEntitlement(url, env);
        }
        if (url.pathname === "/portal") {
          return await handleCustomerPortal(url, env);
        }
        if (url.pathname === "/auth/url") {
          return handleAuthURL(env);
        }
        // WorkOS redirects here after auth → we redirect to the app's custom URL scheme
        if (url.pathname === "/auth/callback") {
          return handleAuthCallbackRedirect(url);
        }
        if (url.pathname === "/openai/token") {
          return handleOpenAIToken(env);
        }
      }
    } catch (error) {
      console.error(`[${url.pathname}] Unhandled error:`, error);
      return new Response(
        JSON.stringify({ error: String(error) }),
        { status: 500, headers: { "content-type": "application/json", "access-control-allow-origin": "*" } }
      );
    }

    return new Response("Not found", { status: 404, headers: { "access-control-allow-origin": "*" } });
  },
};

// ─── Auth ──────────────────────────────────────────────────

/**
 * GET /auth/url
 * Returns the WorkOS AuthKit authorization URL for the app to open in a browser.
 * The redirect_uri points to this Worker's /auth/callback endpoint (a web URL),
 * which then redirects to the app's skilly:// custom scheme.
 */
function handleAuthURL(env: Env): Response {
  // WorkOS requires a web URL as redirect_uri — custom schemes don't work directly.
  // We use the Worker's own /auth/callback as the redirect target.
  const workerCallbackURL = new URL("/auth/callback", env.WORKOS_REDIRECT_URI.startsWith("http")
    ? env.WORKOS_REDIRECT_URI
    : `https://skilly-proxy.eng-mohamedszaied.workers.dev/auth/callback`);

  const authURL = new URL("https://api.workos.com/user_management/authorize");
  authURL.searchParams.set("client_id", env.WORKOS_CLIENT_ID);
  authURL.searchParams.set("redirect_uri", workerCallbackURL.toString());
  authURL.searchParams.set("response_type", "code");
  authURL.searchParams.set("provider", "authkit");

  return new Response(
    JSON.stringify({ url: authURL.toString() }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}

/**
 * GET /auth/callback?code=XXX
 * WorkOS redirects here after successful authentication.
 * We redirect to the app's custom URL scheme: skilly://auth/callback?code=XXX
 *
 * Uses JavaScript window.location + a clickable fallback link because
 * browsers block meta-refresh and 302 redirects to custom URL schemes.
 */
function handleAuthCallbackRedirect(url: URL): Response {
  const code = url.searchParams.get("code");

  if (!code) {
    return new Response("Missing authorization code", { status: 400 });
  }

  const appURL = `skilly://auth/callback?code=${encodeURIComponent(code)}`;

  const html = `<!DOCTYPE html>
<html>
<head><title>Skilly — Signing in</title></head>
<body style="font-family: -apple-system, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #1a1a2e; color: #fff;">
  <div style="text-align: center;">
    <h2>Opening Skilly...</h2>
    <p style="color: #888;">If nothing happens, <a href="${appURL}" style="color: #6C63FF;">click here to open Skilly</a>.</p>
    <p id="status" style="color: #555; font-size: 12px; margin-top: 24px;">Redirecting...</p>
  </div>
  <script>
    window.location.href = "${appURL}";
    // Try to close the tab after a short delay
    setTimeout(function() {
      document.getElementById("status").textContent = "You can close this tab now.";
      window.close();
    }, 1500);
  </script>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: { "content-type": "text/html" },
  });
}

/**
 * POST /auth/token
 * Exchanges a WorkOS authorization code for a user profile + access token.
 * The app sends { code: "..." } and gets back { user, accessToken }.
 */
async function handleAuthToken(request: Request, env: Env): Promise<Response> {
  const body = await request.json() as Record<string, string>;
  const grantType = body.grant_type || "authorization_code";

  // MARK: - Skilly
  if (grantType === "refresh_token") {
    const refreshToken = body.refresh_token;

    if (!refreshToken) {
      return new Response(
        JSON.stringify({ error: "Missing refresh token" }),
        { status: 400, headers: { "content-type": "application/json" } }
      );
    }

    const refreshResponse = await fetch(
      "https://api.workos.com/user_management/authenticate",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          client_id: env.WORKOS_CLIENT_ID,
          client_secret: env.WORKOS_API_KEY,
          grant_type: "refresh_token",
          refresh_token: refreshToken,
        }),
      }
    );

    if (!refreshResponse.ok) {
      const errorBody = await refreshResponse.text();
      console.error(`[/auth/token] WorkOS refresh error ${refreshResponse.status}: ${errorBody}`);
      return new Response(errorBody, {
        status: refreshResponse.status,
        headers: { "content-type": "application/json" },
      });
    }

    const refreshedData = await refreshResponse.json() as {
      user: { id: string; email: string; first_name: string; last_name: string };
      access_token: string;
      refresh_token?: string;
    };

    return new Response(
      JSON.stringify({
        user: {
          id: refreshedData.user.id,
          email: refreshedData.user.email,
          firstName: refreshedData.user.first_name,
          lastName: refreshedData.user.last_name,
        },
        accessToken: refreshedData.access_token,
        refreshToken: refreshedData.refresh_token,
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  }

  const { code } = body;

  if (!code) {
    return new Response(
      JSON.stringify({ error: "Missing authorization code" }),
      { status: 400, headers: { "content-type": "application/json" } }
    );
  }

  const response = await fetch(
    "https://api.workos.com/user_management/authenticate",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        client_id: env.WORKOS_CLIENT_ID,
        client_secret: env.WORKOS_API_KEY,
        grant_type: "authorization_code",
        code: code,
      }),
    }
  );

  if (!response.ok) {
    const errorBody = await response.text();
    console.error(`[/auth/token] WorkOS error ${response.status}: ${errorBody}`);
    return new Response(errorBody, {
      status: response.status,
      headers: { "content-type": "application/json" },
    });
  }

  const data = await response.json() as {
    user: { id: string; email: string; first_name: string; last_name: string };
    access_token: string;
    refresh_token: string;
  };

  // Return only what the app needs — user profile and access token
  return new Response(
    JSON.stringify({
      user: {
        id: data.user.id,
        email: data.user.email,
        firstName: data.user.first_name,
        lastName: data.user.last_name,
      },
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
    }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}

// ─── Chat ──────────────────────────────────────────────────

async function handleChat(request: Request, env: Env): Promise<Response> {
  const body = await request.text();

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body,
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error(`[/chat] Anthropic API error ${response.status}: ${errorBody}`);
    return new Response(errorBody, {
      status: response.status,
      headers: { "content-type": "application/json" },
    });
  }

  return new Response(response.body, {
    status: response.status,
    headers: {
      "content-type": response.headers.get("content-type") || "text/event-stream",
      "cache-control": "no-cache",
    },
  });
}

// ─── Transcription ─────────────────────────────────────────

async function handleTranscribeToken(env: Env): Promise<Response> {
  const response = await fetch(
    "https://streaming.assemblyai.com/v3/token?expires_in_seconds=480",
    {
      method: "GET",
      headers: {
        authorization: env.ASSEMBLYAI_API_KEY,
      },
    }
  );

  if (!response.ok) {
    const errorBody = await response.text();
    console.error(`[/transcribe-token] AssemblyAI token error ${response.status}: ${errorBody}`);
    return new Response(errorBody, {
      status: response.status,
      headers: { "content-type": "application/json" },
    });
  }

  const data = await response.text();
  return new Response(data, {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

// ─── TTS ───────────────────────────────────────────────────

async function handleTTS(request: Request, env: Env): Promise<Response> {
  const body = await request.text();
  const voiceId = env.ELEVENLABS_VOICE_ID;

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": env.ELEVENLABS_API_KEY,
        "content-type": "application/json",
        accept: "audio/mpeg",
      },
      body,
    }
  );

  if (!response.ok) {
    const errorBody = await response.text();
    console.error(`[/tts] ElevenLabs API error ${response.status}: ${errorBody}`);
    return new Response(errorBody, {
      status: response.status,
      headers: { "content-type": "application/json" },
    });
  }

  return new Response(response.body, {
    status: response.status,
    headers: {
      "content-type": response.headers.get("content-type") || "audio/mpeg",
    },
  });
}

// ─── OpenAI Token Relay ────────────────────────────────────

/**
 * GET /openai/token
 * Returns the OpenAI API key so the app can connect directly to
 * the OpenAI Realtime WebSocket. The key is stored as a Worker
 * secret and never ships in the app binary.
 */
function handleOpenAIToken(env: Env): Response {
  if (!env.OPENAI_API_KEY) {
    return new Response(
      JSON.stringify({ error: "OpenAI API key not configured" }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }

  return new Response(
    JSON.stringify({
      apiKey: env.OPENAI_API_KEY,
      model: "gpt-realtime",
    }),
    {
      status: 200,
      headers: {
        "content-type": "application/json",
        "cache-control": "private, max-age=300",
      },
    }
  );
}

interface CheckoutPayload {
  user_id: string;
  email: string;
}

interface EntitlementData {
  user_id: string;
  status: "active" | "canceled" | "none";
  period_start?: string;
  period_end?: string;
  plan?: string;
}

interface PolarWebhookEvent {
  type: string;
  data: {
    id: string;
    customer_email: string;
    status: string;
    current_period_end: string;
    metadata?: {
      user_id?: string;
    };
  };
}

async function handleCheckoutCreate(request: Request, env: Env): Promise<Response> {
  let body: CheckoutPayload;
  try {
    body = await request.json() as CheckoutPayload;
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const { user_id, email } = body;
  if (!user_id || !email) {
    return new Response("Missing user_id or email", { status: 400 });
  }

  try {
    const polarBase = env.POLAR_API_BASE || "https://api.polar.sh";
    const polarResponse = await fetch(`${polarBase}/v1/checkouts`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.POLAR_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        product_price_id: env.POLAR_BETA_PRICE_ID,
        customer_email: email,
        metadata: { user_id },
        success_url: "https://tryskilly.app/checkout-success",
      }),
    });

    if (!polarResponse.ok) {
      const errorText = await polarResponse.text();
      console.error("[/checkout/create] Polar API error:", errorText);
      return new Response(JSON.stringify({ error: "Failed to create checkout" }), {
        status: 502,
        headers: { "content-type": "application/json" },
      });
    }

    const polarData = await polarResponse.json() as { url?: string };
    return new Response(JSON.stringify({ checkout_url: polarData.url }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (error) {
    console.error("[/checkout/create] Error:", error);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}

async function handlePolarWebhook(request: Request, env: Env): Promise<Response> {
  // Polar uses the Standard Webhooks specification.
  // Headers: webhook-id, webhook-timestamp, webhook-signature
  // Signature: v1,<base64_hmac_sha256>
  // Signing payload: {msg_id}.{timestamp}.{body}
  const webhookId = request.headers.get("webhook-id");
  const webhookTimestamp = request.headers.get("webhook-timestamp");
  const webhookSignature = request.headers.get("webhook-signature");
  const rawBody = await request.text();

  const isValid = await verifyStandardWebhookSignature(
    rawBody, webhookId ?? "", webhookTimestamp ?? "", webhookSignature ?? "", env.POLAR_WEBHOOK_SECRET
  );
  if (!isValid) {
    console.error("[/webhooks/polar] Signature verification failed");
    return new Response("Invalid signature", { status: 401 });
  }

  let event: PolarWebhookEvent;
  try {
    event = JSON.parse(rawBody) as PolarWebhookEvent;
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const userId = event.data.metadata?.user_id;
  if (!userId) {
    return new Response("ok", { status: 200 });
  }

  const kvKey = `user:${userId}`;
  let record: EntitlementData;

  switch (event.type) {
    case "subscription.created":
    case "subscription.active": {
      record = {
        user_id: userId,
        status: "active",
        period_start: new Date().toISOString(),
        period_end: event.data.current_period_end ?? "",
        plan: "beta_19",
      };
      break;
    }
    case "subscription.canceled":
    case "subscription.revoked": {
      record = {
        user_id: userId,
        status: "canceled",
        period_end: event.data.current_period_end ?? "",
        plan: "beta_19",
      };
      break;
    }
    case "subscription.updated": {
      const existing = await env.SKILLY_ENTITLEMENTS.get<EntitlementData>(kvKey, "json");
      record = {
        user_id: userId,
        status: existing?.status ?? "active",
        period_start: existing?.period_start ?? new Date().toISOString(),
        period_end: event.data.current_period_end ?? "",
        plan: "beta_19",
      };
      break;
    }
    default:
      return new Response("ok", { status: 200 });
  }

  await env.SKILLY_ENTITLEMENTS.put(kvKey, JSON.stringify(record));

  return new Response("ok", { status: 200 });
}

async function handleEntitlement(url: URL, env: Env): Promise<Response> {
  const userId = url.searchParams.get("user_id");
  if (!userId) {
    return new Response("Missing user_id", { status: 400 });
  }

  const record = await env.SKILLY_ENTITLEMENTS.get<EntitlementData>(`user:${userId}`, "json");
  if (!record) {
    return new Response(JSON.stringify({ status: "none" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }

  return new Response(JSON.stringify(record), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

/// Creates a Polar customer portal session and redirects to it.
/// The portal lets customers manage their subscription (cancel, update payment).
/// Usage: GET /portal?email=user@example.com
async function handleCustomerPortal(url: URL, env: Env): Promise<Response> {
  const email = url.searchParams.get("email");
  if (!email) {
    return new Response("Missing email", { status: 400 });
  }

  const polarBase = env.POLAR_API_BASE || "https://api.polar.sh";

  try {
    // Look up the customer by email
    const customerRes = await fetch(
      `${polarBase}/v1/customers?email=${encodeURIComponent(email)}`,
      {
        headers: { Authorization: `Bearer ${env.POLAR_API_KEY}` },
      }
    );

    if (!customerRes.ok) {
      return new Response(JSON.stringify({ error: "Customer lookup failed" }), {
        status: 502,
        headers: { "content-type": "application/json" },
      });
    }

    const customers = await customerRes.json() as { items: Array<{ id: string }> };
    if (!customers.items?.length) {
      return new Response(JSON.stringify({ error: "No customer found" }), {
        status: 404,
        headers: { "content-type": "application/json" },
      });
    }

    const customerId = customers.items[0].id;

    // Create a customer portal session
    const sessionRes = await fetch(`${polarBase}/v1/customer-sessions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.POLAR_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ customer_id: customerId }),
    });

    if (!sessionRes.ok) {
      const errText = await sessionRes.text();
      console.error("[/portal] Session creation failed:", errText);
      return new Response(JSON.stringify({ error: "Portal session failed" }), {
        status: 502,
        headers: { "content-type": "application/json" },
      });
    }

    const session = await sessionRes.json() as { customer_portal_url?: string };
    if (session.customer_portal_url) {
      // Redirect the user's browser directly to the portal
      return Response.redirect(session.customer_portal_url, 302);
    }

    return new Response(JSON.stringify({ error: "No portal URL returned" }), {
      status: 502,
      headers: { "content-type": "application/json" },
    });
  } catch (error) {
    console.error("[/portal] Error:", error);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}

/// Verify a Standard Webhooks signature (used by Polar).
/// The secret is the full polar_whs_* string — used as raw UTF-8 key.
/// Signature header format: "v1,<base64_hmac>" (may have multiple sigs).
/// Signing payload: "{msg_id}.{timestamp}.{body}"
async function verifyStandardWebhookSignature(
  body: string,
  msgId: string,
  timestamp: string,
  signatureHeader: string,
  secret: string
): Promise<boolean> {
  try {
    if (!msgId || !timestamp || !signatureHeader) return false;

    // Extract all v1 signatures (there may be multiple, space-separated)
    const signatures = signatureHeader.split(" ");
    const v1Sigs = signatures
      .filter((s: string) => s.startsWith("v1,"))
      .map((s: string) => s.substring(3));

    if (v1Sigs.length === 0) return false;

    // Signing payload: msg_id.timestamp.body
    const encoder = new TextEncoder();
    const signedData = encoder.encode(`${msgId}.${timestamp}.${body}`);

    // Try using the secret as raw UTF-8 key first
    const keyData = encoder.encode(secret);
    const cryptoKey = await crypto.subtle.importKey(
      "raw", keyData,
      { name: "HMAC", hash: "SHA-256" },
      false, ["sign"]
    );
    const signatureBuffer = await crypto.subtle.sign("HMAC", cryptoKey, signedData);
    const expectedSig = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)));

    // Check if any of the provided signatures match
    if (v1Sigs.includes(expectedSig)) return true;

    // Fallback: try base64-decoding the secret (Standard Webhooks spec
    // says secrets may be base64-encoded after a prefix like "whsec_").
    // Polar secrets start with "polar_whs_" — try stripping and decoding.
    const prefixes = ["polar_whs_", "whsec_"];
    for (const prefix of prefixes) {
      if (secret.startsWith(prefix)) {
        try {
          const secretBase64 = secret.substring(prefix.length);
          const rawKey = Uint8Array.from(atob(secretBase64), (c: string) => c.charCodeAt(0));
          const decodedCryptoKey = await crypto.subtle.importKey(
            "raw", rawKey,
            { name: "HMAC", hash: "SHA-256" },
            false, ["sign"]
          );
          const decodedSigBuffer = await crypto.subtle.sign("HMAC", decodedCryptoKey, signedData);
          const decodedExpectedSig = btoa(String.fromCharCode(...new Uint8Array(decodedSigBuffer)));
          if (v1Sigs.includes(decodedExpectedSig)) return true;
        } catch {
          // Base64 decode failed — not base64 encoded, continue
        }
      }
    }

    return false;
  } catch {
    return false;
  }
}
