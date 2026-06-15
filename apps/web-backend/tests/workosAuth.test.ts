import { afterEach, describe, expect, test } from "bun:test";
import { MemoryRepo } from "../src/db/memoryRepo";
import {
  buildWorkOSAuthorizeUrl,
  createSelfServeDashboardMembership,
  createWorkOSMagicEmailCookie,
  createWorkOSState,
  normalizeWorkOSEmail,
  parseWorkOSMagicEmailCookie,
  parseWorkOSStateCookie,
  parseWorkOSAuthMethod,
  resolveDashboardMembership,
  safeDashboardNextPath,
} from "../src/lib/workosAuth";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

function configureWorkOS(): void {
  Object.assign(process.env, {
    WORKOS_CLIENT_ID: "client_123",
    WORKOS_API_KEY: "sk_test_123",
    WORKOS_DASHBOARD_REDIRECT_URI: "http://localhost:4310/api/auth/workos/callback",
    SKILLY_DASHBOARD_SESSION_SECRET: "session-secret",
  });
}

describe("WorkOS dashboard auth", () => {
  test("builds an AuthKit authorization URL with the dashboard callback", () => {
    configureWorkOS();

    const url = new URL(buildWorkOSAuthorizeUrl("state_123"));

    expect(url.origin + url.pathname).toBe("https://api.workos.com/user_management/authorize");
    expect(url.searchParams.get("client_id")).toBe("client_123");
    expect(url.searchParams.get("redirect_uri")).toBe("http://localhost:4310/api/auth/workos/callback");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("provider")).toBe("authkit");
    expect(url.searchParams.get("state")).toBe("state_123");
  });

  test("can build a direct Google OAuth authorization URL", () => {
    configureWorkOS();

    const url = new URL(buildWorkOSAuthorizeUrl("state_123", "google"));

    expect(url.searchParams.get("provider")).toBe("GoogleOAuth");
  });

  test("defaults unknown auth methods to email AuthKit", () => {
    expect(parseWorkOSAuthMethod("google")).toBe("google");
    expect(parseWorkOSAuthMethod("email")).toBe("email");
    expect(parseWorkOSAuthMethod("github")).toBe("email");
    expect(parseWorkOSAuthMethod(null)).toBe("email");
  });

  test("roundtrips signed OAuth state and rejects tampering", () => {
    configureWorkOS();

    const state = createWorkOSState("/dashboard/keys");
    const parsed = parseWorkOSStateCookie(state.cookieValue);

    expect(parsed?.nonce).toBe(state.state);
    expect(parsed?.nextPath).toBe("/dashboard/keys");
    expect(parseWorkOSStateCookie(`${state.cookieValue}tampered`)).toBeNull();
  });

  test("normalizes valid dashboard emails and rejects invalid addresses", () => {
    expect(normalizeWorkOSEmail(" Admin@TrySkilly.App ")).toBe("admin@tryskilly.app");
    expect(normalizeWorkOSEmail("not-an-email")).toBeNull();
    expect(normalizeWorkOSEmail("")).toBeNull();
  });

  test("roundtrips the signed Magic Auth pending email cookie", () => {
    configureWorkOS();

    const cookie = createWorkOSMagicEmailCookie("Admin@TrySkilly.App", "/dashboard/keys", "signup");
    const parsed = parseWorkOSMagicEmailCookie(cookie.cookieValue);

    expect(parsed?.email).toBe("admin@tryskilly.app");
    expect(parsed?.nextPath).toBe("/dashboard/keys");
    expect(parsed?.intent).toBe("signup");
    expect(cookie.maxAge).toBeGreaterThan(0);
    expect(parseWorkOSMagicEmailCookie(`${cookie.cookieValue}tampered`)).toBeNull();
  });

  test("allows only dashboard-relative redirect targets", () => {
    expect(safeDashboardNextPath("/dashboard/billing")).toBe("/dashboard/billing");
    expect(safeDashboardNextPath("/onboarding/company")).toBe("/onboarding/company");
    expect(safeDashboardNextPath("https://evil.example/dashboard")).toBe("/dashboard");
    expect(safeDashboardNextPath("/admin")).toBe("/dashboard");
  });

  test("resolves WorkOS identity through explicit dashboard memberships", async () => {
    const membership = await resolveDashboardMembership(new MemoryRepo(), {
      user: {
        id: "user_01KP21J3GEVH8AKJ31C59Z1KJQ",
        email: "admin@tryskilly.app",
        firstName: null,
        lastName: null,
      },
      workosOrganizationId: null,
    });

    expect(membership?.tenantId).toBe("11111111-1111-1111-1111-111111111111");
    expect(membership?.role).toBe("super_admin");
  });

  test("does not bootstrap unmapped WorkOS users unless explicitly enabled", async () => {
    const membership = await resolveDashboardMembership(new MemoryRepo(), {
      user: {
        id: "user_new",
        email: "new@tryskilly.app",
        firstName: null,
        lastName: null,
      },
      workosOrganizationId: null,
    });

    expect(membership).toBeNull();
  });

  test("can bootstrap a WorkOS user into the default tenant when enabled", async () => {
    process.env.SKILLY_DASHBOARD_BOOTSTRAP_WORKOS = "true";
    const repo = new MemoryRepo();

    const membership = await resolveDashboardMembership(repo, {
      user: {
        id: "user_new",
        email: "new@tryskilly.app",
        firstName: null,
        lastName: null,
      },
      workosOrganizationId: null,
    });

    expect(membership?.tenantId).toBe("11111111-1111-1111-1111-111111111111");
    expect(membership?.role).toBe("super_admin");
    expect(await repo.findDashboardMembership({ workosUserId: "user_new" })).toEqual(membership);
  });

  test("creates a fresh self-serve tenant membership for signup", async () => {
    const repo = new MemoryRepo();

    const membership = await createSelfServeDashboardMembership(repo, {
      user: {
        id: "user_signup",
        email: "founder@example.com",
        firstName: null,
        lastName: null,
      },
      workosOrganizationId: "org_signup",
    });

    const tenant = await repo.getTenant(membership.tenantId);
    expect(membership.role).toBe("super_admin");
    expect(membership.email).toBe("founder@example.com");
    expect(membership.workosOrganizationId).toBe("org_signup");
    expect(tenant?.name).toBe("Founder workspace");
    expect(membership.tenantId).not.toBe("11111111-1111-1111-1111-111111111111");
  });
});
