import { describe, expect, test } from "bun:test";
import { BackendError } from "../src/token";
import {
  clampWidgetPanelPosition,
  defaultWidgetPanelPosition,
  parseWidgetPanelPosition,
  positionPointerCaption,
  presentWidgetError,
  QUOTA_DISABLED_NOTICE,
  shouldRevealWidgetHistory,
} from "../src/widgetState";

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

describe("widget panel and pointer layout", () => {
  test("anchors the conversation panel above the launcher by default", () => {
    expect(
      defaultWidgetPanelPosition(
        { width: 1_200, height: 800 },
        { width: 380, height: 420 },
      ),
    ).toEqual({ x: 800, y: 288 });
  });

  test("clamps a restored draggable panel position inside the viewport", () => {
    expect(
      clampWidgetPanelPosition(
        { x: 1_000, y: -80 },
        { width: 360, height: 460 },
        { width: 1_024, height: 700 },
      ),
    ).toEqual({ x: 648, y: 16 });
  });

  test("rejects malformed persisted panel coordinates", () => {
    expect(parseWidgetPanelPosition('{"x":120,"y":240}')).toEqual({ x: 120, y: 240 });
    expect(parseWidgetPanelPosition('{"x":"120","y":240}')).toBeNull();
    expect(parseWidgetPanelPosition("not-json")).toBeNull();
  });

  test("keeps the spoken caption beside the pointer without leaving the viewport", () => {
    expect(
      positionPointerCaption(
        { x: 980, y: 690 },
        { width: 280, height: 96 },
        { width: 1_024, height: 768 },
      ),
    ).toEqual({ x: 672, y: 566 });
  });

  test("auto-expands new history on desktop without covering the mobile page", () => {
    expect(shouldRevealWidgetHistory(0, 1, 1_200)).toBe(true);
    expect(shouldRevealWidgetHistory(0, 1, 390)).toBe(false);
    expect(shouldRevealWidgetHistory(2, 3, 1_200)).toBe(false);
  });
});
