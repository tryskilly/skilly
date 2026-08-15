import { BackendError } from "./token.js";
import type { SkillyState } from "./types.js";

export type WidgetNoticeState = Extract<SkillyState, "error" | "quotaDisabled" | "micDenied">;

export interface WidgetNotice {
  state: WidgetNoticeState;
  title: string;
  message: string;
  retryable: boolean;
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
