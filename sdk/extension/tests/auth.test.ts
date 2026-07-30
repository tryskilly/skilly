import { afterEach, describe, expect, test, mock } from "bun:test";
import { buildWorkOSAuthorizeUrl, exchangeCodeForSession } from "../src/auth";

const REAL_FETCH = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = REAL_FETCH;
});

describe("buildWorkOSAuthorizeUrl", () => {
  test("builds a WorkOS authorize URL with the given client id and redirect uri", () => {
    const url = new URL(buildWorkOSAuthorizeUrl("client_abc", "https://ext-id.chromiumapp.org/"));
    expect(url.origin + url.pathname).toBe("https://api.workos.com/user_management/authorize");
    expect(url.searchParams.get("client_id")).toBe("client_abc");
    expect(url.searchParams.get("redirect_uri")).toBe("https://ext-id.chromiumapp.org/");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("provider")).toBe("authkit");
  });
});

describe("exchangeCodeForSession", () => {
  test("posts the code to the backend and returns the session", async () => {
    const fetchMock = mock(
      async (_url: string, _init?: RequestInit) =>
        new Response(JSON.stringify({ sessionToken: "tok_abc", expiresAt: 123, email: "a@b.com" }), { status: 200 }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const session = await exchangeCodeForSession("https://studio.tryskilly.app", "auth-code-123");
    expect(session).toEqual({ sessionToken: "tok_abc", expiresAt: 123, email: "a@b.com" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://studio.tryskilly.app/api/extension/auth/exchange");
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ code: "auth-code-123" });
  });

  // A trailing slash on the configured backend URL must not produce a double-slashed path.
  test("normalises a trailing slash on the backend url", async () => {
    const fetchMock = mock(
      async (_url: string, _init?: RequestInit) =>
        new Response(JSON.stringify({ sessionToken: "t", expiresAt: 1, email: "a@b.com" }), { status: 200 }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await exchangeCodeForSession("https://studio.tryskilly.app/", "code");
    expect(fetchMock.mock.calls[0]![0]).toBe("https://studio.tryskilly.app/api/extension/auth/exchange");
  });

  test("throws when the backend rejects the exchange", async () => {
    globalThis.fetch = mock(
      async () => new Response(JSON.stringify({ error: "authentication failed" }), { status: 401 }),
    ) as unknown as typeof fetch;
    await expect(exchangeCodeForSession("https://studio.tryskilly.app", "bad-code")).rejects.toThrow();
  });

  // The auth code is single-use and grants a session — it must never reach a log or an error
  // string that could be surfaced or reported.
  test("does not include the auth code in the thrown error", async () => {
    globalThis.fetch = mock(async () => new Response("nope", { status: 401 })) as unknown as typeof fetch;
    await expect(exchangeCodeForSession("https://studio.tryskilly.app", "super-secret-code")).rejects.toThrow(
      /^(?!.*super-secret-code).*$/,
    );
  });
});
