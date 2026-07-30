// The full cross-component message protocol. Every message that crosses a chrome.runtime or
// chrome.tabs boundary in this extension is declared here — content script <-> background,
// background <-> offscreen document, popup -> background. Nothing communicates via an ad hoc,
// undeclared shape.
//
// Element ids that cross these boundaries are FRAME-QUALIFIED ("f7:el_1", see frameRegistry.ts)
// everywhere except inside a single frame's own content script, which only ever sees its own
// local ids.
import type { ActionRequest, ActionResult, DomDigest } from "@skilly/browser-core";

// Content script -> background
export interface RegisterFrameMessage {
  type: "register-frame";
  frameId: number;
  digest: DomDigest;
}
export interface ActionResultMessage {
  type: "action-result";
  frameId: number;
  callId: string;
  result: ActionResult;
}
export type ContentToBackgroundMessage = RegisterFrameMessage | ActionResultMessage;

// Background -> content script (chrome.tabs.sendMessage, targeted at one frameId)
export interface PointAtMessage {
  type: "point-at";
  /** Frame-local id — the background un-qualifies before routing to the owning frame. */
  target: string;
  label: string;
}
export interface ExecuteActionMessage {
  type: "execute-action";
  callId: string;
  request: ActionRequest;
}
export interface RefreshDigestMessage {
  type: "refresh-digest";
}
export interface ShowBannerMessage {
  type: "show-banner";
  text: string;
}
export type BackgroundToContentMessage =
  | PointAtMessage
  | ExecuteActionMessage
  | RefreshDigestMessage
  | ShowBannerMessage;

// Offscreen document -> background
export interface PointRequestMessage {
  type: "point-request";
  /** Frame-qualified id as emitted by the model in a [POINT:id:label] tag. */
  target: string;
  label: string;
}
export interface ActionRequestMessage {
  type: "action-request";
  callId: string;
  request: ActionRequest;
}
export interface SessionStateMessage {
  type: "session-state";
  state: "connecting" | "live" | "closed" | "error";
}
export interface AssistantTextMessage {
  type: "assistant-text";
  text: string;
}
export interface UsageReportMessage {
  type: "usage-report";
  seconds: number;
  actionsExecuted: number;
  actionsRefused: number;
}
export type OffscreenToBackgroundMessage =
  | PointRequestMessage
  | ActionRequestMessage
  | SessionStateMessage
  | AssistantTextMessage
  | UsageReportMessage;

// Background -> offscreen document
export interface StartSessionMessage {
  type: "start-session";
  clientSecret: string;
  model: string;
  instructions: string;
  actionsEnabled: boolean;
}
export interface StopSessionMessage {
  type: "stop-session";
}
export interface ActionOutcomeMessage {
  type: "action-outcome";
  callId: string;
  result: ActionResult;
}
export type BackgroundToOffscreenMessage = StartSessionMessage | StopSessionMessage | ActionOutcomeMessage;

// Popup -> background. A WXT popup entrypoint sets the manifest's action.default_popup, which
// means chrome.action.onClicked NEVER fires once a popup exists (the popup opens instead) — the
// popup's own "Start/Stop on this page" button is therefore the only way to toggle a session,
// and it does so via this message, not via the toolbar-click event.
export interface ToggleSessionMessage {
  type: "toggle-session";
}
export interface GetSessionStatusMessage {
  type: "get-session-status";
}
export type PopupToBackgroundMessage = ToggleSessionMessage | GetSessionStatusMessage;
