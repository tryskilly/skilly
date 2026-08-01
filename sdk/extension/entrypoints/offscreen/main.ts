// Chrome's session host. All the session logic lives in src/realtimeHost.ts, shared with the
// Firefox path (which runs the same host inside its event page, since offscreen documents are
// Chrome-only). This file is just the chrome.runtime transport around it.
import { createRealtimeHost } from "../../src/realtimeHost";
import type { BackgroundToOffscreenMessage } from "../../src/messages";

const host = createRealtimeHost({
  post: (message) => {
    void chrome.runtime.sendMessage(message).catch(() => undefined);
  },
});

chrome.runtime.onMessage.addListener((message: BackgroundToOffscreenMessage) => {
  host.handle(message);
  return false;
});

// The browser can tear this document down; report accrued usage rather than losing the session.
globalThis.addEventListener("pagehide", () => host.dispose());
