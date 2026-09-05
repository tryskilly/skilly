import { describe, expect, test } from "bun:test";
import { accessErrorMessage, accessFailureFromResponse, isExtensionTokenResponse } from "../src/access";

describe("extension access DTO", () => {
  test("accepts the Studio paid token response", () => {
    expect(
      isExtensionTokenResponse({
        clientSecret: "ek_test",
        expiresAt: 1,
        model: "gpt-realtime",
        accessMode: "paid",
        remainingSeconds: 42,
        sessionId: "session_1",
      }),
    ).toBe(true);
  });

  test("rejects a token response without server session metadata", () => {
    expect(isExtensionTokenResponse({ clientSecret: "ek_test", model: "gpt-realtime" })).toBe(false);
  });

  test("maps stable server block codes and statuses", () => {
    expect(accessFailureFromResponse(403, { code: "subscription_inactive" }).code).toBe("subscription_inactive");
    expect(accessFailureFromResponse(429, { code: "cap_reached" }).code).toBe("cap_reached");
    expect(accessFailureFromResponse(401, {}).code).toBe("authentication_required");
    expect(accessFailureFromResponse(503, {}).code).toBe("backend_unavailable");
    expect(accessErrorMessage("cap_reached")).toContain("billing period");
  });
});
