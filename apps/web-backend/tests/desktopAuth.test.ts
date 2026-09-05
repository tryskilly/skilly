import { afterEach, describe, expect, mock, test } from "bun:test";
import { decodeBase64UrlJson } from "../src/lib/signedToken";
import { buildDesktopAuthorizeUrl, mintDesktopSessionToken } from "../src/lib/desktopAuth";

const originalEnv = { ...process.env };
const originalFetch = globalThis.fetch;

afterEach(() => {
  process.env = { ...originalEnv };
  globalThis.fetch = originalFetch;
  mock.restore();
});

function configure(): void {
  Object.assign(process.env, {
    NODE_ENV: "test",
    WORKOS_CLIENT_ID: "client_test",
    WORKOS_API_KEY: "secret_test",
    SESSION_TOKEN_SECRET: "session_test",
    WORKOS_MAC_REDIRECT_URI: "https://tryskilly.app/api/mac/auth/callback",
  });
}

describe("Studio desktop auth", () => {
  test("rejects unknown grants and invalid JSON bodies", async () => {
    const { POST } = await import("../src/app/api/mac/auth/token/route");
    for (const body of ["null", "[]", "broken", JSON.stringify({ grant_type: "password", code: "code_12345678" })]) {
      const response = await POST(new Request("https://studio.example/api/mac/auth/token", { method: "POST", body }) as never);
      expect(response.status).toBe(400);
    }
  });
  test("builds a WorkOS authorize URL with the registered callback", () => {
    configure();
    const url = new URL(buildDesktopAuthorizeUrl("state_1234567890123456"));
    expect(url.origin + url.pathname).toBe("https://api.workos.com/user_management/authorize");
    expect(url.searchParams.get("client_id")).toBe("client_test");
    expect(url.searchParams.get("redirect_uri")).toBe("https://tryskilly.app/api/mac/auth/callback");
    expect(url.searchParams.get("state")).toBe("state_1234567890123456");
  });

  test("mints the session shape consumed by Mac verification", () => {
    configure();
    const token = mintDesktopSessionToken({ id: "user_123", email: "person@example.com", firstName: null, lastName: null });
    const [, payload] = token.split(".");
    expect(decodeBase64UrlJson(payload!)).toMatchObject({ sub: "user_123", iss: "skilly-studio", aud: "skilly-desktop" });
  });

  test("fails closed when the session secret is absent", () => {
    configure();
    delete process.env.SESSION_TOKEN_SECRET;
    expect(() => mintDesktopSessionToken({ id: "user_123", email: "person@example.com", firstName: null, lastName: null })).toThrow();
  });

  test("exchanges a WorkOS code and preserves Swift AuthResponse fields", async () => {
    configure();
    globalThis.fetch = mock(async () => new Response(JSON.stringify({
      user: { id: "user_123", email: "person@example.com", first_name: "A", last_name: "B" },
      access_token: "access_12345678",
      refresh_token: "refresh_12345678",
    }), { status: 200, headers: { "content-type": "application/json" } })) as unknown as typeof fetch;
    const { POST } = await import("../src/app/api/mac/auth/token/route");
    const response = await POST(new Request("https://tryskilly.app/api/mac/auth/token", { method: "POST", body: JSON.stringify({ code: "code_12345678" }) }) as never);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ accessToken: "access_12345678", refreshToken: "refresh_12345678", user: { id: "user_123", firstName: "A" } });
  });

  test("rejects malformed state and never creates an arbitrary redirect", async () => {
    const { GET: urlGET } = await import("../src/app/api/mac/auth/url/route");
    const response = urlGET(new Request("https://tryskilly.app/api/mac/auth/url?state=short") as never);
    expect(response.status).toBe(400);
    const { GET: callbackGET } = await import("../src/app/api/mac/auth/callback/route");
    const callback = callbackGET(new Request("https://tryskilly.app/api/mac/auth/callback?code=code_12345678&state=short") as never);
    expect(callback.status).toBe(400);
  });

  test("escapes callback values in HTML while preserving the deep-link target", async () => {
    const { GET } = await import("../src/app/api/mac/auth/callback/route");
    const response = GET(new Request("https://tryskilly.app/api/mac/auth/callback?code=code_%22%3Cscript%3E&state=state_1234567890123456") as never);
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(html).not.toContain('<script>location.href="skilly://auth/callback?code=code_"<');
    expect(html).toContain("&amp;state=");
    expect(html).toContain("code_%22%3Cscript%3E");
  });

  test("refreshes and binds the returned user to the new Studio session", async () => {
    configure();
    globalThis.fetch = mock(async () => new Response(JSON.stringify({
      user: { id: "user_refresh", email: "refresh@example.com", first_name: "R", last_name: "User" },
      access_token: "access_refresh_123",
      refresh_token: "refresh_next_123",
    }), { status: 200, headers: { "content-type": "application/json" } })) as unknown as typeof fetch;
    const { POST } = await import("../src/app/api/mac/auth/token/route");
    const response = await POST(new Request("https://tryskilly.app/api/mac/auth/token", { method: "POST", body: JSON.stringify({ grant_type: "refresh_token", refresh_token: "refresh_old_123" }) }) as never);
    const body = await response.json() as { user: { id: string }; sessionToken: string };
    expect(response.status).toBe(200);
    expect(body.user.id).toBe("user_refresh");
    const [, payload] = body.sessionToken.split(".");
    expect(decodeBase64UrlJson(payload!)).toMatchObject({ sub: "user_refresh", email: "refresh@example.com" });
  });
});
