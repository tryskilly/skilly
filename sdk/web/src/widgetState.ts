import { BackendError } from "./token.js";
import type { SkillyState } from "./types.js";

export type WidgetNoticeState = Extract<SkillyState, "error" | "quotaDisabled" | "micDenied">;

export interface WidgetNotice {
  state: WidgetNoticeState;
  title: string;
  message: string;
  retryable: boolean;
}

export interface WidgetPoint {
  x: number;
  y: number;
}

export interface WidgetSize {
  width: number;
  height: number;
}

const WIDGET_VIEWPORT_EDGE = 16;
const WIDGET_DEFAULT_RIGHT = 20;
const WIDGET_DEFAULT_BOTTOM = 92;
const POINTER_CAPTION_OFFSET = 28;
const MOBILE_HISTORY_COLLAPSE_WIDTH = 480;

export function shouldRevealWidgetHistory(
  previousMessageCount: number,
  nextMessageCount: number,
  viewportWidth: number,
): boolean {
  return previousMessageCount === 0 && nextMessageCount > 0 && viewportWidth > MOBILE_HISTORY_COLLAPSE_WIDTH;
}

export function clampWidgetPanelPosition(
  position: WidgetPoint,
  panelSize: WidgetSize,
  viewportSize: WidgetSize,
): WidgetPoint {
  const maximumX = Math.max(WIDGET_VIEWPORT_EDGE, viewportSize.width - panelSize.width - WIDGET_VIEWPORT_EDGE);
  const maximumY = Math.max(WIDGET_VIEWPORT_EDGE, viewportSize.height - panelSize.height - WIDGET_VIEWPORT_EDGE);
  return {
    x: Math.max(WIDGET_VIEWPORT_EDGE, Math.min(maximumX, position.x)),
    y: Math.max(WIDGET_VIEWPORT_EDGE, Math.min(maximumY, position.y)),
  };
}

export function defaultWidgetPanelPosition(
  viewportSize: WidgetSize,
  panelSize: WidgetSize,
): WidgetPoint {
  return clampWidgetPanelPosition(
    {
      x: viewportSize.width - panelSize.width - WIDGET_DEFAULT_RIGHT,
      y: viewportSize.height - panelSize.height - WIDGET_DEFAULT_BOTTOM,
    },
    panelSize,
    viewportSize,
  );
}

export function parseWidgetPanelPosition(value: string | null): WidgetPoint | null {
  if (!value) {
    return null;
  }
  try {
    const parsed = JSON.parse(value) as { x?: unknown; y?: unknown };
    if (
      typeof parsed.x !== "number" ||
      typeof parsed.y !== "number" ||
      !Number.isFinite(parsed.x) ||
      !Number.isFinite(parsed.y)
    ) {
      return null;
    }
    return { x: parsed.x, y: parsed.y };
  } catch {
    return null;
  }
}

export function positionPointerCaption(
  pointerPosition: WidgetPoint,
  captionSize: WidgetSize,
  viewportSize: WidgetSize,
): WidgetPoint {
  let x = pointerPosition.x + POINTER_CAPTION_OFFSET;
  let y = pointerPosition.y + POINTER_CAPTION_OFFSET;
  if (x + captionSize.width > viewportSize.width - WIDGET_VIEWPORT_EDGE) {
    x = pointerPosition.x - captionSize.width - POINTER_CAPTION_OFFSET;
  }
  if (y + captionSize.height > viewportSize.height - WIDGET_VIEWPORT_EDGE) {
    y = pointerPosition.y - captionSize.height - POINTER_CAPTION_OFFSET;
  }
  return clampWidgetPanelPosition({ x, y }, captionSize, viewportSize);
}

const MICROPHONE_DENIED_NOTICE: WidgetNotice = {
  state: "micDenied",
  title: "Microphone access is off",
  message: "Allow microphone access for this site in your browser settings, then try again.",
  retryable: true,
};

export const QUOTA_DISABLED_NOTICE: WidgetNotice = {
  state: "quotaDisabled",
  title: "Skilly is unavailable right now",
  message: "This assistant has reached its current session limit. Please try again later.",
  retryable: false,
};

const SITE_UNAVAILABLE_NOTICE: WidgetNotice = {
  state: "error",
  title: "Skilly is not available here",
  message: "This site has not enabled the assistant for this page.",
  retryable: false,
};

const GENERIC_ERROR_NOTICE: WidgetNotice = {
  state: "error",
  title: "Skilly could not start",
  message: "Check your connection and try again.",
  retryable: true,
};

function errorName(error: unknown): string {
  if (typeof error === "object" && error !== null && "name" in error) {
    return String((error as { name?: unknown }).name ?? "");
  }
  return "";
}

function errorMessage(error: unknown, fallbackMessage = ""): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  return fallbackMessage;
}

/** Map technical failures to safe visitor-facing copy without leaking backend details. */
export function presentWidgetError(error: unknown, fallbackMessage = ""): WidgetNotice {
  if (error instanceof BackendError) {
    if (error.status === 402 || error.status === 429) {
      return QUOTA_DISABLED_NOTICE;
    }
    if (error.status === 401 || error.status === 403) {
      return SITE_UNAVAILABLE_NOTICE;
    }
  }

  const normalizedName = errorName(error).toLowerCase();
  const normalizedMessage = errorMessage(error, fallbackMessage).toLowerCase();
  const microphoneWasDenied =
    normalizedName === "notallowederror" ||
    normalizedName === "permissiondeniederror" ||
    normalizedMessage.includes("permission denied") ||
    normalizedMessage.includes("permission dismissed") ||
    normalizedMessage.includes("notallowederror");
  if (microphoneWasDenied) {
    return MICROPHONE_DENIED_NOTICE;
  }

  if (normalizedMessage.includes("quota") || normalizedMessage.includes("session limit")) {
    return QUOTA_DISABLED_NOTICE;
  }

  return GENERIC_ERROR_NOTICE;
}
