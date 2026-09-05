import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const source = (path: string) => readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8");

describe("Desktop single-backend boundary", () => {
  test("Mac runtime has no Worker URL or opt-in fallback", () => {
    for (const file of ["AppSettings", "AuthManager", "EntitlementManager", "OpenAIRealtimeClient"]) {
      const text = source(`leanring-buddy/${file}.swift`);
      expect(text).not.toContain("workers.dev");
      expect(text).not.toContain("workerBaseURL");
      expect(text).not.toContain("useStudioMacBackend");
    }
  });

  test("Mac auth, entitlement, checkout, portal and relay use Studio routes", () => {
    const auth = source("leanring-buddy/AuthManager.swift");
    expect(auth).toContain("/api/mac/auth/url");
    expect(auth).toContain("/api/mac/auth/token");
    const billing = source("leanring-buddy/EntitlementManager.swift");
    for (const endpoint of ["entitlement", "checkout", "portal"]) expect(billing).toContain(`/api/mac/${endpoint}`);
    expect(source("leanring-buddy/OpenAIRealtimeClient.swift")).toContain("/api/mac/openai/token");
  });

  test("Windows defaults to the same desktop API", () => {
    const windows = source("apps/windows-shell-gui/src/backend_client.rs");
    expect(windows).toContain('DEFAULT_BACKEND_BASE_URL: &str = "https://studio.tryskilly.app/api/mac"');
    expect(windows).not.toContain("workers.dev");
    expect(windows).toContain('"/checkout"');
  });
});
