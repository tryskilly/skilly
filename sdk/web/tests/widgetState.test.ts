import { describe, expect, test } from "bun:test";
import { BackendError } from "../src/token";
import { presentWidgetError, QUOTA_DISABLED_NOTICE } from "../src/widgetState";

describe("visitor-safe widget error presentation", () => {
  test("maps browser microphone rejection without exposing the technical message", () => {
    const notice = presentWidgetError({
      name: "NotAllowedError",
      message: "Permission denied by system policy /Users/example",
    });

    expect(notice.state).toBe("micDenied");
    expect(notice.retryable).toBe(true);
    expect(notice.message).not.toContain("/Users/example");
  });

  test("maps backend quota responses to a non-retryable limit state", () => {
    expect(presentWidgetError(new BackendError("token endpoint returned 429", 429))).toEqual(
      QUOTA_DISABLED_NOTICE,
    );
  });

  test("maps origin failures to safe site availability copy", () => {
    const notice = presentWidgetError(new BackendError("origin mismatch: secret.example", 403));

    expect(notice.state).toBe("error");
    expect(notice.retryable).toBe(false);
    expect(notice.message).not.toContain("secret.example");
  });

  test("keeps generic backend and realtime details out of visitor copy", () => {
    const notice = presentWidgetError(new Error("Realtime SDP exchange failed (503)"));

    expect(notice.state).toBe("error");
    expect(notice.retryable).toBe(true);
    expect(notice.message).toBe("Check your connection and try again.");
  });
});
