# Extension Backend Routes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `/api/extension/*` routes to `apps/web-backend` so the Skilly browser extension can
authenticate a user (via WorkOS), read their shared entitlement, mint an ephemeral OpenAI
Realtime token, and report usage — isolated from the in-flight Mac/Studio cutover, per the
approved design.

**Architecture:** Reuses the existing `mac_entitlements`/`mac_usage_events` tables and their
read/write functions **unchanged** (entitlement is keyed by WorkOS user id, not by client
surface, and usage recording already has a `source` column for per-surface tagging — no schema
change needed for either). The one genuinely new capability is a token-minting endpoint: unlike
Mac (whose session token is minted by the Cloudflare Worker and merely verified by Studio), the
extension has no Worker in its flow at all, so Studio itself must mint the session token after a
WorkOS code exchange — a capability that does not exist anywhere in this codebase yet.

**Tech Stack:** Next.js App Router route handlers, `pg` (Postgres), Bun test, the existing
WorkOS REST integration.

## Global Constraints

- No new database tables or columns. `mac_entitlements` and `mac_usage_events` are reused as-is.
- Zero changes to `apps/web-backend/src/lib/macSession.ts` — this plan's isolation requirement
  (decision 2 in the design) means the in-flight, risk-sensitive Mac cutover code is not touched,
  even to extract shared helpers. A small amount of low-level HMAC-signing boilerplate is
  deliberately duplicated into a new file rather than shared, and that tradeoff is intentional —
  do not "clean this up" by refactoring `macSession.ts` as part of this plan.
- `SESSION_TOKEN_SECRET` (already used by `macSession.ts` to sign/verify) is reused for signing
  extension tokens too — it is a general-purpose HMAC secret, not Mac-specific; no new secret to
  provision.
- Every route: `export const runtime = "nodejs"` and `export const dynamic = "force-dynamic"`,
  matching every existing `/api/mac/*` and `/api/web/*` route.
- Match existing code style: routes stay thin (auth → call a `lib` function → shape the
  response); business logic lives in `src/lib/`, not inline in `route.ts` files.

---

### Task 1: Extension session — mint and verify

**Files:**
- Create: `apps/web-backend/src/lib/extensionSession.ts`
- Test: `apps/web-backend/tests/extensionSession.test.ts`

**Interfaces:**
- Produces:
  `export interface ExtensionSession { userId: string; email: string; issuedAt: number; expiresAt: number; }`
  `export function mintExtensionSessionToken(user: { id: string; email: string }): { token: string; expiresAt: number }`
  `export function verifyExtensionSessionToken(token: string): ExtensionSession | null`
  `export function authenticateExtensionRequest(request: Request): ExtensionSession | null`
  `export function selectExtensionOpenAIAPIKey(): string`

- [ ] **Step 1: Write the failing tests**

Create `apps/web-backend/tests/extensionSession.test.ts`:

```typescript
import { describe, expect, test } from "bun:test";
import {
  mintExtensionSessionToken,
  verifyExtensionSessionToken,
  authenticateExtensionRequest,
  selectExtensionOpenAIAPIKey,
} from "@/lib/extensionSession";

const ORIGINAL_ENV = { ...process.env };

function withSecret<T>(secret: string | undefined, run: () => T): T {
  process.env.SESSION_TOKEN_SECRET = secret;
  try {
    return run();
  } finally {
    process.env = { ...ORIGINAL_ENV };
  }
}

describe("mintExtensionSessionToken / verifyExtensionSessionToken", () => {
  test("a freshly minted token verifies back to the same user", () => {
    withSecret("test-secret", () => {
      const { token, expiresAt } = mintExtensionSessionToken({ id: "user_123", email: "a@b.com" });
      expect(expiresAt).toBeGreaterThan(Date.now() / 1000);
      const session = verifyExtensionSessionToken(token);
      expect(session).toEqual({
        userId: "user_123",
        email: "a@b.com",
        issuedAt: session!.issuedAt,
        expiresAt: session!.expiresAt,
      });
    });
  });

  test("rejects a token signed with a different secret", () => {
    const token = withSecret("secret-a", () => mintExtensionSessionToken({ id: "u", email: "e@x.com" }).token);
    withSecret("secret-b", () => {
      expect(verifyExtensionSessionToken(token)).toBeNull();
    });
  });

  test("rejects malformed tokens", () => {
    withSecret("test-secret", () => {
      expect(verifyExtensionSessionToken("not-a-real-token")).toBeNull();
      expect(verifyExtensionSessionToken("")).toBeNull();
    });
  });

  test("a Mac session token (different audience) does not verify as an extension session", () => {
    // Cross-audience rejection matters: a Mac-issued token must never be replayable
    // against /api/extension/* routes, and vice versa.
    withSecret("shared-secret", () => {
      // Hand-construct a token with the Mac audience using the same low-level shape
      // extensionSession.ts uses, to prove the audience check actually discriminates.
      const header = Buffer.from(JSON.stringify({ alg: "HS256" })).toString("base64url");
      const payload = Buffer.from(
        JSON.stringify({
          sub: "user_123",
          email: "a@b.com",
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 3600,
          iss: "skilly-studio",
          aud: "skilly-desktop", // wrong audience on purpose
        }),
      ).toString("base64url");
      const { createHmac } = require("node:crypto");
      const signature = createHmac("sha256", "shared-secret")
        .update(`${header}.${payload}`)
        .digest("base64url");
      expect(verifyExtensionSessionToken(`${header}.${payload}.${signature}`)).toBeNull();
    });
  });
});

describe("authenticateExtensionRequest", () => {
  test("extracts and verifies a Bearer token from the Authorization header", () => {
    withSecret("test-secret", () => {
      const { token } = mintExtensionSessionToken({ id: "user_123", email: "a@b.com" });
      const request = new Request("https://example.com", { headers: { authorization: `Bearer ${token}` } });
      expect(authenticateExtensionRequest(request)?.userId).toBe("user_123");
    });
  });

  test("returns null with no Authorization header", () => {
    withSecret("test-secret", () => {
      expect(authenticateExtensionRequest(new Request("https://example.com"))).toBeNull();
    });
  });

  test("returns null for a non-Bearer scheme", () => {
    withSecret("test-secret", () => {
      const request = new Request("https://example.com", { headers: { authorization: "Basic abc" } });
      expect(authenticateExtensionRequest(request)).toBeNull();
    });
  });
});

describe("selectExtensionOpenAIAPIKey", () => {
  test("prefers OPENAI_API_KEY_EXTENSION over OPENAI_API_KEY", () => {
    process.env.OPENAI_API_KEY_EXTENSION = "key-extension";
    process.env.OPENAI_API_KEY = "key-shared";
    expect(selectExtensionOpenAIAPIKey()).toBe("key-extension");
    process.env = { ...ORIGINAL_ENV };
  });

  test("falls back to OPENAI_API_KEY when OPENAI_API_KEY_EXTENSION is unset", () => {
    delete process.env.OPENAI_API_KEY_EXTENSION;
    process.env.OPENAI_API_KEY = "key-shared";
    expect(selectExtensionOpenAIAPIKey()).toBe("key-shared");
    process.env = { ...ORIGINAL_ENV };
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/web-backend && bun test tests/extensionSession.test.ts`
Expected: FAIL — `Cannot find module '@/lib/extensionSession'`.

- [ ] **Step 3: Implement `extensionSession.ts`**

```typescript
// Extension-compatible session: mint + verify. Unlike macSession.ts (which only VERIFIES
// tokens the Cloudflare Worker mints), the browser extension has no Worker in its flow at all —
// Studio itself mints this token, right after a WorkOS code exchange. The low-level HMAC
// sign/verify plumbing below is deliberately duplicated from macSession.ts rather than shared:
// macSession.ts is mid-migration and risk-sensitive (see CLAUDE.md's BYOK/Studio migration
// notes), and this is ~25 lines of generic crypto boilerplate, not business logic worth coupling
// two independently-evolving auth surfaces over.
import { createHmac, timingSafeEqual } from "node:crypto";

export interface ExtensionSession {
  userId: string;
  email: string;
  issuedAt: number;
  expiresAt: number;
}

const EXTENSION_SESSION_ISSUER = "skilly-studio";
const EXTENSION_SESSION_AUDIENCE = "skilly-extension";
const EXTENSION_SESSION_TTL_SECONDS = 60 * 60 * 24 * 14; // 14 days — no refresh flow in v1

function sessionSecret(): string | null {
  return process.env.SESSION_TOKEN_SECRET ?? null;
}

function signPayload(payload: string): string | null {
  const secret = sessionSecret();
  return secret ? createHmac("sha256", secret).update(payload).digest("base64url") : null;
}

function signaturesMatch(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function base64UrlEncodeJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function decodeBase64UrlJson(value: string): Record<string, unknown> | null {
  try {
    return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function mintExtensionSessionToken(user: { id: string; email: string }): {
  token: string;
  expiresAt: number;
} {
  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAt = issuedAt + EXTENSION_SESSION_TTL_SECONDS;
  const header = base64UrlEncodeJson({ alg: "HS256" });
  const payload = base64UrlEncodeJson({
    sub: user.id,
    email: user.email,
    iat: issuedAt,
    exp: expiresAt,
    iss: EXTENSION_SESSION_ISSUER,
    aud: EXTENSION_SESSION_AUDIENCE,
  });
  const signature = signPayload(`${header}.${payload}`);
  if (!signature) {
    throw new Error("SESSION_TOKEN_SECRET is not configured");
  }
  return { token: `${header}.${payload}.${signature}`, expiresAt };
}

export function verifyExtensionSessionToken(token: string): ExtensionSession | null {
  const [encodedHeader, encodedPayload, signature] = token.split(".");
  if (!encodedHeader || !encodedPayload || !signature) {
    return null;
  }
  const expectedSignature = signPayload(`${encodedHeader}.${encodedPayload}`);
  if (!expectedSignature || !signaturesMatch(signature, expectedSignature)) {
    return null;
  }
  const payload = decodeBase64UrlJson(encodedPayload);
  const userId = payload?.sub;
  const email = payload?.email;
  const issuedAt = payload?.iat;
  const expiresAt = payload?.exp;
  if (
    typeof userId !== "string" ||
    typeof email !== "string" ||
    typeof issuedAt !== "number" ||
    typeof expiresAt !== "number" ||
    payload?.iss !== EXTENSION_SESSION_ISSUER ||
    payload?.aud !== EXTENSION_SESSION_AUDIENCE ||
    expiresAt <= Math.floor(Date.now() / 1000)
  ) {
    return null;
  }
  return { userId, email, issuedAt, expiresAt };
}

export function authenticateExtensionRequest(request: Request): ExtensionSession | null {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return null;
  }
  const token = authorization.slice("Bearer ".length).trim();
  return token ? verifyExtensionSessionToken(token) : null;
}

export function selectExtensionOpenAIAPIKey(): string {
  return process.env.OPENAI_API_KEY_EXTENSION ?? process.env.OPENAI_API_KEY ?? "";
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/web-backend && bun test tests/extensionSession.test.ts`
Expected: PASS, all 9 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/web-backend/src/lib/extensionSession.ts apps/web-backend/tests/extensionSession.test.ts
git commit -m "Add extension session mint/verify (isolated from macSession.ts)"
```

---

### Task 2: `POST /api/extension/auth/exchange` — WorkOS code → session token

**Files:**
- Create: `apps/web-backend/src/app/api/extension/auth/exchange/route.ts`
- Test: `apps/web-backend/tests/extensionAuthExchangeRoute.test.ts`

**Interfaces:**
- Consumes: `exchangeWorkOSCode(code: string): Promise<WorkOSAuthResult>` from
  `@/lib/workosAuth` (existing, unchanged — already used by the dashboard's OAuth callback, and
  already generic: it only needs `WORKOS_CLIENT_ID`/`WORKOS_API_KEY` and a `code`, nothing
  dashboard- or cookie-specific). `mintExtensionSessionToken` from Task 1.
- Produces: `POST /api/extension/auth/exchange` — body `{ code: string }` → `200
  { sessionToken: string, expiresAt: number, email: string }`, or `400`/`401`/`502` on failure.

- [ ] **Step 1: Write the failing test**

Create `apps/web-backend/tests/extensionAuthExchangeRoute.test.ts`:

```typescript
import { describe, expect, test, mock } from "bun:test";

mock.module("@/lib/workosAuth", () => ({
  exchangeWorkOSCode: async (code: string) => {
    if (code === "bad-code") {
      throw new Error("WorkOS authenticate failed with 400");
    }
    return {
      user: { id: "user_abc", email: "person@example.com", firstName: "A", lastName: "B" },
      workosOrganizationId: null,
    };
  },
}));

const { POST } = await import("@/app/api/extension/auth/exchange/route");

describe("POST /api/extension/auth/exchange", () => {
  test("mints a session token on a valid code", async () => {
    const request = new Request("https://example.com/api/extension/auth/exchange", {
      method: "POST",
      body: JSON.stringify({ code: "good-code" }),
    });
    const response = await POST(request as never);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { sessionToken: string; expiresAt: number; email: string };
    expect(typeof body.sessionToken).toBe("string");
    expect(body.email).toBe("person@example.com");
    expect(body.expiresAt).toBeGreaterThan(Date.now() / 1000);
  });

  test("returns 400 when the request body has no code", async () => {
    const request = new Request("https://example.com/api/extension/auth/exchange", {
      method: "POST",
      body: JSON.stringify({}),
    });
    const response = await POST(request as never);
    expect(response.status).toBe(400);
  });

  test("returns 401 when WorkOS rejects the code", async () => {
    const request = new Request("https://example.com/api/extension/auth/exchange", {
      method: "POST",
      body: JSON.stringify({ code: "bad-code" }),
    });
    const response = await POST(request as never);
    expect(response.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/web-backend && bun test tests/extensionAuthExchangeRoute.test.ts`
Expected: FAIL — the route file does not exist yet.

- [ ] **Step 3: Implement the route**

```typescript
// POST /api/extension/auth/exchange — the browser extension's login step. The extension itself
// opens WorkOS's authorize URL via chrome.identity.launchWebAuthFlow (WORKOS_CLIENT_ID is a
// public identifier, safe to bake into the extension's own config — the extension needs no
// secret to start this flow) and captures the `code` from the redirect. This route does the
// server-side half: exchange that code for the WorkOS user, then mint a session token the
// extension stores and sends as a Bearer token to every other /api/extension/* route.
import { NextResponse, type NextRequest } from "next/server";
import { exchangeWorkOSCode, WorkOSUpstreamError } from "@/lib/workosAuth";
import { mintExtensionSessionToken } from "@/lib/extensionSession";
import { captureServerEvent } from "@/lib/analytics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = (await request.json().catch(() => ({}))) as { code?: unknown };
  const code = typeof body.code === "string" ? body.code : null;
  if (!code) {
    return NextResponse.json({ error: "missing code" }, { status: 400 });
  }

  let auth: Awaited<ReturnType<typeof exchangeWorkOSCode>>;
  try {
    auth = await exchangeWorkOSCode(code);
  } catch (error) {
    const status = error instanceof WorkOSUpstreamError ? error.status : 502;
    await captureServerEvent("extension_auth_exchange_failed", {
      status,
      source_surface: "studio_backend",
    });
    return NextResponse.json({ error: "authentication failed" }, { status: status === 502 ? 502 : 401 });
  }

  if (!auth.user.email) {
    return NextResponse.json({ error: "WorkOS account has no email" }, { status: 401 });
  }

  const { token, expiresAt } = mintExtensionSessionToken({ id: auth.user.id, email: auth.user.email });
  await captureServerEvent("extension_auth_exchange_succeeded", {
    workos_user_id: auth.user.id,
    source_surface: "studio_backend",
  });
  return NextResponse.json({ sessionToken: token, expiresAt, email: auth.user.email });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/web-backend && bun test tests/extensionAuthExchangeRoute.test.ts`
Expected: PASS, all 3 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/web-backend/src/app/api/extension/auth/exchange/route.ts apps/web-backend/tests/extensionAuthExchangeRoute.test.ts
git commit -m "Add POST /api/extension/auth/exchange"
```

---

### Task 3: `GET /api/extension/entitlement` and `GET /api/extension/openai/token`

**Files:**
- Create: `apps/web-backend/src/app/api/extension/entitlement/route.ts`
- Create: `apps/web-backend/src/app/api/extension/openai/token/route.ts`
- Test: `apps/web-backend/tests/extensionEntitlementRoute.test.ts`
- Test: `apps/web-backend/tests/extensionOpenaiTokenRoute.test.ts`

**Interfaces:**
- Consumes: `authenticateExtensionRequest` (Task 1), `getMacEntitlement(userId): Promise<MacEntitlementRecord | null>` (existing, from `@/lib/macSession`, unchanged), `selectExtensionOpenAIAPIKey` (Task 1), `mintRealtimeToken({ apiKey }): Promise<{ clientSecret, expiresAt, model }>` (existing, from `@/domain/openaiToken`, unchanged).
- Produces: `GET /api/extension/entitlement` → `200 MacEntitlementRecord`-shaped JSON (reusing
  the exact same shape `/api/mac/entitlement` returns) or `401`. `GET /api/extension/openai/token`
  → `200 { clientSecret, expiresAt, model }` or `401`/`500`/`502`.

- [ ] **Step 1: Write the failing tests**

Create `apps/web-backend/tests/extensionEntitlementRoute.test.ts`:

```typescript
import { describe, expect, test, mock } from "bun:test";
import { mintExtensionSessionToken } from "@/lib/extensionSession";

mock.module("@/lib/macSession", () => ({
  getMacEntitlement: async (userId: string) =>
    userId === "user_with_entitlement"
      ? { user_id: userId, status: "active", entitlement_type: "relay", period_start: null, period_end: null, plan: "pro", polar_customer_id: null }
      : null,
}));

const { GET } = await import("@/app/api/extension/entitlement/route");

function authedRequest(userId: string): Request {
  process.env.SESSION_TOKEN_SECRET = "test-secret";
  const { token } = mintExtensionSessionToken({ id: userId, email: "a@b.com" });
  return new Request("https://example.com/api/extension/entitlement", {
    headers: { authorization: `Bearer ${token}` },
  });
}

describe("GET /api/extension/entitlement", () => {
  test("returns 401 with no Authorization header", async () => {
    const response = await GET(new Request("https://example.com/api/extension/entitlement") as never);
    expect(response.status).toBe(401);
  });

  test("returns the entitlement record for a user who has one", async () => {
    const response = await GET(authedRequest("user_with_entitlement") as never);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { status: string };
    expect(body.status).toBe("active");
  });

  test("returns status:none for a user with no entitlement row, not a 404", async () => {
    const response = await GET(authedRequest("user_without_entitlement") as never);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { status: string };
    expect(body.status).toBe("none");
  });
});
```

Create `apps/web-backend/tests/extensionOpenaiTokenRoute.test.ts`:

```typescript
import { describe, expect, test, mock } from "bun:test";
import { mintExtensionSessionToken } from "@/lib/extensionSession";

mock.module("@/domain/openaiToken", () => ({
  mintRealtimeToken: async () => ({ clientSecret: "ek_test_123", expiresAt: Date.now() / 1000 + 60, model: "gpt-realtime" }),
  TokenMintError: class TokenMintError extends Error {},
}));

const { GET } = await import("@/app/api/extension/openai/token/route");

function authedRequest(): Request {
  process.env.SESSION_TOKEN_SECRET = "test-secret";
  const { token } = mintExtensionSessionToken({ id: "user_abc", email: "a@b.com" });
  return new Request("https://example.com/api/extension/openai/token", {
    headers: { authorization: `Bearer ${token}` },
  });
}

describe("GET /api/extension/openai/token", () => {
  test("returns 401 with no Authorization header", async () => {
    const response = await GET(new Request("https://example.com/api/extension/openai/token") as never);
    expect(response.status).toBe(401);
  });

  test("mints a token for an authenticated request", async () => {
    process.env.OPENAI_API_KEY_EXTENSION = "sk-test";
    const response = await GET(authedRequest() as never);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { clientSecret: string };
    expect(body.clientSecret).toBe("ek_test_123");
  });

  test("returns 500 when no OpenAI key is configured", async () => {
    delete process.env.OPENAI_API_KEY_EXTENSION;
    delete process.env.OPENAI_API_KEY;
    const response = await GET(authedRequest() as never);
    expect(response.status).toBe(500);
  });
});
```

- [ ] **Step 2: Run both to verify they fail**

Run: `cd apps/web-backend && bun test tests/extensionEntitlementRoute.test.ts tests/extensionOpenaiTokenRoute.test.ts`
Expected: FAIL — neither route file exists yet.

- [ ] **Step 3: Implement `GET /api/extension/entitlement`**

```typescript
// GET /api/extension/entitlement — reuses the exact same entitlement table Mac reads
// (mac_entitlements is keyed by WorkOS user id, not by client surface, so one paying
// subscription unlocks both Mac and the extension with zero schema change).
import { NextResponse, type NextRequest } from "next/server";
import { authenticateExtensionRequest } from "@/lib/extensionSession";
import { getMacEntitlement } from "@/lib/macSession";
import { captureServerEvent } from "@/lib/analytics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const session = authenticateExtensionRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const record = await getMacEntitlement(session.userId);
  await captureServerEvent("extension_entitlement_checked", {
    workos_user_id: session.userId,
    status: record?.status ?? "none",
    source_surface: "studio_backend",
  });
  return NextResponse.json(
    record ?? {
      user_id: session.userId,
      status: "none",
      entitlement_type: null,
      period_start: null,
      period_end: null,
      plan: null,
      polar_customer_id: null,
    },
  );
}
```

- [ ] **Step 4: Implement `GET /api/extension/openai/token`**

```typescript
// GET /api/extension/openai/token — mints an ephemeral OpenAI Realtime client secret for an
// authenticated extension user. Mirrors /api/mac/openai/token's shape exactly.
import { NextResponse, type NextRequest } from "next/server";
import { mintRealtimeToken, TokenMintError } from "@/domain/openaiToken";
import { authenticateExtensionRequest, selectExtensionOpenAIAPIKey } from "@/lib/extensionSession";
import { captureServerEvent } from "@/lib/analytics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const session = authenticateExtensionRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = selectExtensionOpenAIAPIKey();
  if (!apiKey) {
    return NextResponse.json({ error: "OpenAI API key not configured" }, { status: 500 });
  }

  try {
    const token = await mintRealtimeToken({ apiKey });
    await captureServerEvent("extension_realtime_token_minted", {
      workos_user_id: session.userId,
      source_surface: "studio_backend",
    });
    return NextResponse.json({ clientSecret: token.clientSecret, expiresAt: token.expiresAt, model: token.model });
  } catch (error) {
    await captureServerEvent("extension_realtime_token_failed", {
      workos_user_id: session.userId,
      status: error instanceof TokenMintError ? error.upstreamStatus : undefined,
      source_surface: "studio_backend",
    });
    return NextResponse.json({ error: "failed to mint realtime token" }, { status: 502 });
  }
}
```

- [ ] **Step 5: Run both tests to verify they pass**

Run: `cd apps/web-backend && bun test tests/extensionEntitlementRoute.test.ts tests/extensionOpenaiTokenRoute.test.ts`
Expected: PASS, all 6 tests.

- [ ] **Step 6: Commit**

```bash
git add apps/web-backend/src/app/api/extension/entitlement/ apps/web-backend/src/app/api/extension/openai/ apps/web-backend/tests/extensionEntitlementRoute.test.ts apps/web-backend/tests/extensionOpenaiTokenRoute.test.ts
git commit -m "Add GET /api/extension/entitlement and GET /api/extension/openai/token"
```

---

### Task 4: `POST /api/extension/usage`

**Files:**
- Create: `apps/web-backend/src/app/api/extension/usage/route.ts`
- Test: `apps/web-backend/tests/extensionUsageRoute.test.ts`

**Interfaces:**
- Consumes: `authenticateExtensionRequest` (Task 1), `recordMacUsage(input): Promise<void>`
  (existing, from `@/lib/macSession`, unchanged — its `source` field is the per-surface tag).
- Produces: `POST /api/extension/usage` → `200 { ok: true, recordedSeconds: number }` or `401`.

- [ ] **Step 1: Write the failing test**

Create `apps/web-backend/tests/extensionUsageRoute.test.ts`:

```typescript
import { describe, expect, test, mock } from "bun:test";
import { mintExtensionSessionToken } from "@/lib/extensionSession";

let recordedCalls: Array<Record<string, unknown>> = [];
mock.module("@/lib/macSession", () => ({
  recordMacUsage: async (input: Record<string, unknown>) => {
    recordedCalls.push(input);
  },
}));

const { POST } = await import("@/app/api/extension/usage/route");

function authedRequest(body: Record<string, unknown>): Request {
  process.env.SESSION_TOKEN_SECRET = "test-secret";
  const { token } = mintExtensionSessionToken({ id: "user_abc", email: "a@b.com" });
  return new Request("https://example.com/api/extension/usage", {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
}

describe("POST /api/extension/usage", () => {
  test("returns 401 with no Authorization header", async () => {
    const response = await POST(
      new Request("https://example.com/api/extension/usage", { method: "POST", body: "{}" }) as never,
    );
    expect(response.status).toBe(401);
  });

  test("records usage tagged with source: extension, regardless of client input", async () => {
    recordedCalls = [];
    const response = await POST(authedRequest({ seconds: 42, source: "something-else" }) as never);
    expect(response.status).toBe(200);
    expect(recordedCalls).toHaveLength(1);
    expect(recordedCalls[0]?.source).toBe("extension");
    expect(recordedCalls[0]?.seconds).toBe(42);
    expect(recordedCalls[0]?.userId).toBe("user_abc");
  });

  test("clamps a missing/invalid seconds value to 0", async () => {
    recordedCalls = [];
    await POST(authedRequest({}) as never);
    expect(recordedCalls[0]?.seconds).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/web-backend && bun test tests/extensionUsageRoute.test.ts`
Expected: FAIL — the route file does not exist yet.

- [ ] **Step 3: Implement the route**

Note the client-supplied `source` field is intentionally ignored, not merely defaulted — the
`source: "extension"` tag is what makes this surface's usage distinguishable in analytics, and a
client should not be able to override which surface its own traffic is attributed to.

```typescript
// POST /api/extension/usage — best-effort usage telemetry, tagged source: "extension" so it's
// distinguishable from Mac's "relay"/"byok" sources in the shared mac_usage_events table
// (decision 5: shared entitlement, per-surface usage tagging).
import { NextResponse, type NextRequest } from "next/server";
import { authenticateExtensionRequest } from "@/lib/extensionSession";
import { recordMacUsage } from "@/lib/macSession";
import { captureServerEvent } from "@/lib/analytics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = authenticateExtensionRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { seconds?: unknown; result?: unknown };
  const seconds = Math.max(0, Math.round(Number(body.seconds) || 0));
  const result = typeof body.result === "string" ? body.result : null;

  await recordMacUsage({
    userId: session.userId,
    email: session.email,
    seconds,
    result,
    source: "extension",
    model: null,
  });
  await captureServerEvent("extension_session_usage_reported", {
    workos_user_id: session.userId,
    seconds,
    result: result ?? undefined,
    source_surface: "studio_backend",
  });

  return NextResponse.json({ ok: true, recordedSeconds: seconds });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/web-backend && bun test tests/extensionUsageRoute.test.ts`
Expected: PASS, all 3 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/web-backend/src/app/api/extension/usage/ apps/web-backend/tests/extensionUsageRoute.test.ts
git commit -m "Add POST /api/extension/usage"
```

---

### Task 5: End-to-end auth spike (the risk the design flagged explicitly)

**Files:** None created — this is a manual verification task, not a code task. Its job is to
prove the four routes above work together against real WorkOS and Postgres, before any extension
code is written against them (per the design's risk note: this surface is newer and less proven
than `/api/mac/*`, which at least has unauthenticated smoke tests run against it in production).

**Interfaces:** None — verification only.

- [ ] **Step 1: Register a WorkOS redirect URI for manual testing**

In the WorkOS dashboard, add a redirect URI for local testing, e.g.
`http://localhost:4310/api/extension/auth/exchange/manual-test-callback` (this is a manual,
out-of-band configuration step in WorkOS's admin UI — there is no code for it in this repo). Note
this is a *temporary* manual-testing URI; the real extension's `chrome.identity`/`browser.identity`
redirect URI (Plan 3) is registered separately once the extension has a stable ID.

- [ ] **Step 2: Manually drive one full round-trip**

With `apps/web-backend` running locally (`bun run dev`) against real `WORKOS_CLIENT_ID`/
`WORKOS_API_KEY`/`SESSION_TOKEN_SECRET`/`DATABASE_URL` env vars:

1. Manually construct a WorkOS authorize URL (client id + the test redirect URI above +
   `response_type=code`) and complete a real login in the browser.
2. Copy the `code` query parameter from the redirect.
3. `curl -X POST http://localhost:4310/api/extension/auth/exchange -d '{"code":"<code>"}'`
   — confirm a `200` with a `sessionToken`.
4. `curl http://localhost:4310/api/extension/entitlement -H "authorization: Bearer <sessionToken>"`
   — confirm a `200` (status `none` is expected and correct for a fresh test account).
5. `curl http://localhost:4310/api/extension/openai/token -H "authorization: Bearer <sessionToken>"`
   — confirm a `200` with a real `clientSecret` (requires a real `OPENAI_API_KEY` or
   `OPENAI_API_KEY_EXTENSION` in the environment).
6. `curl -X POST http://localhost:4310/api/extension/usage -H "authorization: Bearer <sessionToken>" -d '{"seconds":30}'`
   — confirm a `200`, then query Postgres directly
   (`SELECT * FROM mac_usage_events WHERE source = 'extension' ORDER BY created_at DESC LIMIT 1;`)
   to confirm the row landed with the right tag.

- [ ] **Step 2 (record the result, no commit needed)**

This task produces no diff — its deliverable is confidence, not code. If any step fails, fix the
underlying route/lib code (re-running that task's unit tests after the fix) before proceeding to
Plan 3, which will build the extension against these routes as trusted infrastructure.
