// One instance per frame, including cross-origin iframes (allFrames: true). Each instance only
// ever deals in its OWN frame's local element ids — the background qualifies them by frame id
// before the model ever sees them, and un-qualifies before routing a directive back here.
import { buildDomDigest, PointingEngine, ActionExecutor } from "@skilly/browser-core";
import { MinimalCursorWidget } from "../src/minimalCursorWidget";
import type { ContentToBackgroundMessage, BackgroundToContentMessage } from "../src/messages";

const BANNER_VISIBLE_MS = 6000;

export default defineContentScript({
  matches: ["<all_urls>"],
  allFrames: true,
  main(ctx) {
    // Skip Skilly's own extension pages (offscreen.html, popup.html) if they were ever matched.
    if (location.protocol.startsWith("chrome-extension") || location.protocol.startsWith("moz-extension")) {
      return;
    }

    const widget = new MinimalCursorWidget();
    widget.mount();
    const pointing = new PointingEngine(widget);

    let currentRegistry = new Map<string, HTMLElement>();
    let sessionActive = true;

    const actionExecutor = new ActionExecutor({
      getRegistry: () => currentRegistry,
      pointing,
      confirm: ({ elementLabel }) => widget.confirmAction(elementLabel),
      isSessionActive: () => sessionActive,
    });

    function sendDigest(): void {
      const { digest, registry } = buildDomDigest();
      currentRegistry = registry;
      const message: ContentToBackgroundMessage = { type: "register-frame", digest };
      // The background may not be listening yet; a rejected sendMessage must not surface as an
      // unhandled rejection in the host page's console.
      void browser.runtime.sendMessage(message).catch(() => undefined);
    }

    sendDigest();

    browser.runtime.onMessage.addListener((rawMessage: BackgroundToContentMessage, _sender, sendResponse) => {
      if (rawMessage.type === "point-at") {
        void pointing.pointAt(rawMessage.target, rawMessage.label, currentRegistry);
        return;
      }
      if (rawMessage.type === "refresh-digest") {
        sendDigest();
        return;
      }
      if (rawMessage.type === "show-banner") {
        widget.showBanner(rawMessage.text);
        setTimeout(() => widget.hideBanner(), BANNER_VISIBLE_MS);
        return;
      }
      if (rawMessage.type === "execute-action") {
        void actionExecutor.execute(rawMessage.request).then((result) => {
          const message: ContentToBackgroundMessage = {
            type: "action-result",
            callId: rawMessage.callId,
            result,
          };
          void browser.runtime.sendMessage(message).catch(() => undefined);
          sendResponse(result);
        });
        return true; // keep the message channel open for the async sendResponse
      }
      return;
    });

    ctx.onInvalidated(() => {
      // Flip this before tearing down so any in-flight action resolves as session_closed rather
      // than acting on a page the user has already navigated away from.
      sessionActive = false;
      actionExecutor.close();
      pointing.clear();
      widget.destroy();
    });
  },
});
