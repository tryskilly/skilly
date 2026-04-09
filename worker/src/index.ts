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
  GEMINI_API_KEY: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    try {
      // POST routes
      if (request.method === "POST") {
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
        if (url.pathname === "/auth/url") {
          return handleAuthURL(env);
        }
        // WorkOS redirects here after auth → we redirect to the app's custom URL scheme
        if (url.pathname === "/auth/callback") {
          return handleAuthCallbackRedirect(url);
        }
        if (url.pathname === "/gemini/token") {
          return handleGeminiToken(env);
        }
      }
    } catch (error) {
      console.error(`[${url.pathname}] Unhandled error:`, error);
      return new Response(
        JSON.stringify({ error: String(error) }),
        { status: 500, headers: { "content-type": "application/json" } }
      );
    }

    return new Response("Not found", { status: 404 });
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
  const { code } = await request.json() as { code: string };

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

// ─── Gemini Token Relay ────────────────────────────────────

/**
 * GET /gemini/token
 * Returns the Gemini API key and WebSocket URL so the app can
 * connect directly to Gemini Live. The API key is stored as a
 * Worker secret and never ships in the app binary.
 *
 * The app fetches this once per session, then connects the
 * WebSocket directly to Gemini (Worker can't proxy WebSockets).
 */
function handleGeminiToken(env: Env): Response {
  if (!env.GEMINI_API_KEY) {
    return new Response(
      JSON.stringify({ error: "Gemini API key not configured" }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }

  return new Response(
    JSON.stringify({
      apiKey: env.GEMINI_API_KEY,
      websocketBaseURL: "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent",
      model: "models/gemini-2.5-flash-native-audio-latest",
    }),
    {
      status: 200,
      headers: {
        "content-type": "application/json",
        "cache-control": "private, max-age=300",  // Cache for 5 min
      },
    }
  );
}
