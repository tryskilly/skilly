import { describe, expect, test } from "bun:test";
import { matchAppId, normalizeAppId } from "../src/domain/appId";
import { MemoryRepo, DEMO_PUBLISHABLE_KEY } from "../src/db/memoryRepo";
import { authenticateWebRequest } from "../src/tenantService";

describe("matchAppId", () => {
  test("exact match", () => {
    expect(matchAppId("com.acme.app", ["com.acme.app"])).toBe(true);
    expect(matchAppId("com.acme.other", ["com.acme.app"])).toBe(false);
    expect(matchAppId("com.acme.app", [])).toBe(false);
  });

  test("trailing wildcard matches the base and sub-ids only", () => {
    const allow = ["com.acme.*"];
    expect(matchAppId("com.acme", allow)).toBe(true);
    expect(matchAppId("com.acme.app", allow)).toBe(true);
    expect(matchAppId("com.acme.beta.app", allow)).toBe(true);
    expect(matchAppId("com.acmecorp", allow)).toBe(false); // not a sub-id
  });

  test("normalizes / rejects blanks", () => {
    expect(normalizeAppId("  com.x  ")).toBe("com.x");
    expect(normalizeAppId("")).toBeNull();
    expect(matchAppId("  ", ["com.x"])).toBe(false);
  });
});

describe("native (app-id) auth path", () => {
  test("accepts the demo key from an allowed app id when there is no origin", async () => {
    const result = await authenticateWebRequest(new MemoryRepo(), {
      rawKey: DEMO_PUBLISHABLE_KEY,
      origin: null,
      appId: "com.acme.demo",
    });
    expect(result.ok).toBe(true);
  });

  test("rejects a disallowed app id (403)", async () => {
    const result = await authenticateWebRequest(new MemoryRepo(), {
      rawKey: DEMO_PUBLISHABLE_KEY,
      origin: null,
      appId: "com.evil.app",
    });
    expect(result).toMatchObject({ ok: false, status: 403 });
  });

  test("a web request (origin present) ignores a spoofed app id", async () => {
    // Origin doesn't match; a spoofed allowed app-id must NOT grant access.
    const result = await authenticateWebRequest(new MemoryRepo(), {
      rawKey: DEMO_PUBLISHABLE_KEY,
      origin: "https://evil.example.com",
      appId: "com.acme.demo",
    });
    expect(result).toMatchObject({ ok: false, status: 403 });
  });

  test("missing both origin and app id (403)", async () => {
    const result = await authenticateWebRequest(new MemoryRepo(), {
      rawKey: DEMO_PUBLISHABLE_KEY,
      origin: null,
      appId: null,
    });
    expect(result).toMatchObject({ ok: false, status: 403 });
  });
});
