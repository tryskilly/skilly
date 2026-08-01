// The coordinator. Owns the active tab, the frame registry, entitlement checks and login; the
// Realtime session itself lives in a host (src/realtimeHost.ts) whose location is per-browser.
//
// On Chrome that host is an offscreen document, because an MV3 service worker has no
// getUserMedia/WebRTC and can be killed at any time. On Firefox the MV3 background is an event
// page — a real document — so the same host runs in-process there and no offscreen document
// (a Chrome-only API) exists. ensureSessionHost/sendToSessionHost hide which of the two is live.
import { FrameRegistry, parseQualifiedTarget } from "../src/frameRegistry";
import { matchSkillForUrl, GENERIC_SKILL_VALUE } from "../src/skillMatcher";
import { BUNDLED_SKILLS } from "../src/bundledSkills";
import { buildWorkOSAuthorizeUrl, exchangeCodeForSession, generateAuthState, authStateMatches } from "../src/auth";
import { createRealtimeHost, type RealtimeHost } from "../src/realtimeHost";
import type {
  ContentToBackgroundMessage,
  OffscreenToBackgroundMessage,
  BackgroundToOffscreenMessage,
  BackgroundToContentMessage,
  PopupToBackgroundMessage,
} from "../src/messages";

const BACKEND_URL = "https://studio.tryskilly.app"; // TODO(config): build-time env var once staging/prod diverge

// The same WorkOS application Studio's dashboard and the Mac app authenticate against — not a
// separate client. WorkOS user ids are per-environment, and mac_entitlements is keyed by user id,
// so a second environment would give a paying Mac subscriber a different id here and report their
// subscription as inactive. This value is a public identifier; the secret (WORKOS_API_KEY) stays
// on the backend, which performs the code exchange in /api/extension/auth/exchange.
const WORKOS_CLIENT_ID = "client_01KP1VJPX4CG5WXEV8QSGTSTVZ";

/** How long content scripts get to answer refresh-digest before the prompt is composed. */
const DIGEST_SETTLE_MS = 300;

export default defineBackground(() => {
  const frameRegistry = new FrameRegistry();
  let activeTabId: number | null = null;

  /**
   * Offscreen documents are a Chrome-only MV3 API, needed there because a service worker has no
   * getUserMedia/WebRTC. Firefox MV3's background is an event page — a real document that can
   * hold the session itself — so on Firefox the same host runs in-process and no offscreen
   * document is involved. Feature-detected rather than branded on a user-agent string.
   */
  const supportsOffscreenDocuments = typeof chrome !== "undefined" && chrome.offscreen !== undefined;

  /** Only used on the Firefox path; stays null on Chrome, where the offscreen document hosts it. */
  let inProcessSessionHost: RealtimeHost | null = null;

  /** Create whichever host this browser supports, if it isn't already running. */
  async function ensureSessionHost(): Promise<void> {
    if (supportsOffscreenDocuments) {
      await ensureOffscreenDocument();
      return;
    }
    inProcessSessionHost ??= createRealtimeHost({
      // No message bus in this direction — the host and the coordinator are the same context.
      post: (message) => handleSessionHostMessage(message),
    });
  }

  function sendToSessionHost(message: BackgroundToOffscreenMessage): void {
    if (supportsOffscreenDocuments) {
      void chrome.runtime.sendMessage(message).catch(() => undefined);
      return;
    }
    inProcessSessionHost?.handle(message);
  }

  /**
   * The popup's skill dropdown wins over URL auto-detection: "" (or absent) means auto-detect,
   * "generic" forces the no-skill companion even on a site a skill would match, and any other
   * value pins that bundled skill. An unrecognised id falls back to auto-detect rather than
   * silently running with no skill.
   */
  function selectSkill(tabUrl: string | undefined, skillOverride: string | null) {
    if (skillOverride === GENERIC_SKILL_VALUE) {
      return null;
    }
    if (skillOverride) {
      const pinned = BUNDLED_SKILLS.find((skill) => skill.id === skillOverride);
      if (pinned) {
        return pinned;
      }
    }
    return tabUrl ? matchSkillForUrl(tabUrl, BUNDLED_SKILLS) : null;
  }

  function notifyActiveTab(text: string): void {
    if (activeTabId === null) {
      return;
    }
    const message: BackgroundToContentMessage = { type: "show-banner", text };
    void chrome.tabs.sendMessage(activeTabId, message).catch(() => undefined);
  }

  async function ensureOffscreenDocument(): Promise<void> {
    const existing = await chrome.runtime.getContexts({
      contextTypes: ["OFFSCREEN_DOCUMENT" as chrome.runtime.ContextType],
    });
    if (existing.length > 0) {
      return;
    }
    await chrome.offscreen.createDocument({
      url: chrome.runtime.getURL("offscreen.html"),
      reasons: ["USER_MEDIA" as chrome.offscreen.Reason],
      justification: "Hosts the OpenAI Realtime voice session (microphone + WebRTC).",
    });
  }

  async function startSession(tabId: number): Promise<void> {
    activeTabId = tabId;
    frameRegistry.clear();

    const stored = await chrome.storage.local.get(["sessionToken", "skillOverride"]);
    const sessionToken = stored.sessionToken as string | undefined;
    const skillOverride = (stored.skillOverride as string | null | undefined) ?? null;
    if (!sessionToken) {
      activeTabId = null;
      return; // not logged in — the popup owns prompting the user to sign in
    }

    const authorizationHeader = { authorization: `Bearer ${sessionToken}` };
    const [entitlementResponse, tokenResponse] = await Promise.all([
      fetch(`${BACKEND_URL}/api/extension/entitlement`, { headers: authorizationHeader }),
      fetch(`${BACKEND_URL}/api/extension/openai/token`, { headers: authorizationHeader }),
    ]);
    if (!entitlementResponse.ok || !tokenResponse.ok) {
      notifyActiveTab("Skilly couldn't connect. Try again in a moment.");
      activeTabId = null;
      return;
    }
    const entitlement = (await entitlementResponse.json()) as { status: string };
    if (entitlement.status !== "active") {
      notifyActiveTab("Your Skilly subscription isn't active.");
      activeTabId = null;
      return;
    }
    const token = (await tokenResponse.json()) as { clientSecret: string; model: string };

    const tab = await chrome.tabs.get(tabId);
    const skill = selectSkill(tab.url, skillOverride);
    void chrome.tabs.sendMessage(tabId, { type: "refresh-digest" } satisfies BackgroundToContentMessage).catch(
      () => undefined,
    );
    // Give content scripts a moment to answer with register-frame before composing the prompt.
    await new Promise((resolve) => setTimeout(resolve, DIGEST_SETTLE_MS));

    // The session may have been stopped (or the tab navigated) while we were awaiting the
    // network and the digest settle — starting a Realtime session now would orphan it.
    if (activeTabId !== tabId) {
      return;
    }

    const instructions = [
      "You are Skilly, a browser extension companion. Help the user with the page they're on.",
      skill ? `--- ACTIVE SKILL: ${skill.name} ---\n${skill.content}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    await ensureSessionHost();
    if (activeTabId !== tabId) {
      return;
    }
    const startMessage: BackgroundToOffscreenMessage = {
      type: "start-session",
      clientSecret: token.clientSecret,
      model: token.model,
      instructions,
      actionsEnabled: true,
    };
    sendToSessionHost(startMessage);
  }

  function stopSession(): void {
    activeTabId = null;
    frameRegistry.clear();
    sendToSessionHost({ type: "stop-session" });
  }

  // chrome.action.onClicked is deliberately NOT used. A WXT popup entrypoint sets the manifest's
  // action.default_popup, and Chrome never fires onClicked when a default_popup is set — the
  // popup opens instead. The popup's "Start/Stop" button is the only toggle entry point, and it
  // reaches this file via the "toggle-session" message below.
  chrome.runtime.onMessage.addListener((message: PopupToBackgroundMessage, _sender, sendResponse) => {
    if (message.type === "toggle-session") {
      void chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
        if (!tab?.id) {
          sendResponse({ active: false });
          return;
        }
        if (activeTabId === tab.id) {
          stopSession();
          sendResponse({ active: false });
          return;
        }
        void startSession(tab.id).then(() => sendResponse({ active: activeTabId === tab.id }));
      });
      return true; // async sendResponse
    }

    if (message.type === "get-session-status") {
      sendResponse({ active: activeTabId !== null });
      return false;
    }

    if (message.type === "login-start") {
      const redirectUri = chrome.identity.getRedirectURL();
      const expectedState = generateAuthState();
      const authorizeUrl = buildWorkOSAuthorizeUrl(WORKOS_CLIENT_ID, redirectUri, expectedState);
      chrome.identity.launchWebAuthFlow({ url: authorizeUrl, interactive: true }, (responseUrl) => {
        const redirectParams = responseUrl ? new URL(responseUrl).searchParams : null;
        const code = redirectParams?.get("code") ?? null;
        // Reject a redirect this flow did not initiate, rather than exchanging its code.
        if (!code || !authStateMatches(expectedState, redirectParams?.get("state") ?? null)) {
          sendResponse({ ok: false });
          return;
        }
        exchangeCodeForSession(BACKEND_URL, code)
          .then((session) =>
            chrome.storage.local.set({ sessionToken: session.sessionToken, email: session.email }),
          )
          .then(() => sendResponse({ ok: true }))
          .catch(() => sendResponse({ ok: false }));
      });
      return true; // keep the channel open for the async sendResponse
    }

    return false;
  });

  // Tab navigation ends the session — a fixed decision from the approved design.
  chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (tabId === activeTabId && changeInfo.status === "loading" && changeInfo.url) {
      stopSession();
    }
  });

  // A closed tab must end the session too, otherwise activeTabId points at a tab that no longer
  // exists and every subsequent sendMessage silently fails.
  chrome.tabs.onRemoved.addListener((tabId) => {
    if (tabId === activeTabId) {
      stopSession();
    }
  });

  chrome.runtime.onMessage.addListener(
    (rawMessage: ContentToBackgroundMessage | OffscreenToBackgroundMessage, sender) => {
      if (rawMessage.type === "register-frame") {
        // sender.frameId is stamped by the browser and is the id chrome.tabs.sendMessage routes
        // on — a content script cannot know or forge it. Frames from other tabs are ignored so a
        // background tab cannot inject elements into the active session's digest.
        if (sender.frameId === undefined || sender.tab?.id !== activeTabId) {
          return false;
        }
        frameRegistry.registerFrame(sender.frameId, rawMessage.digest);
        return false;
      }

      if (rawMessage.type === "action-result") {
        sendToSessionHost({ type: "action-outcome", callId: rawMessage.callId, result: rawMessage.result });
        return false;
      }

      handleSessionHostMessage(rawMessage);
      return false;
    },
  );

  /**
   * Messages coming back from whichever host is running the session. Called by the runtime
   * listener on Chrome (offscreen document -> chrome.runtime) and directly by the in-process
   * host on Firefox, which has no message bus between itself and this code.
   */
  function handleSessionHostMessage(rawMessage: OffscreenToBackgroundMessage): void {
    {
      if (rawMessage.type === "point-request") {
        const qualified = parseQualifiedTarget(rawMessage.target);
        if (!qualified || activeTabId === null) {
          return;
        }
        const pointMessage: BackgroundToContentMessage = {
          type: "point-at",
          target: qualified.localTarget,
          label: rawMessage.label,
        };
        void chrome.tabs
          .sendMessage(activeTabId, pointMessage, { frameId: qualified.frameId })
          .catch(() => undefined);
        return;
      }

      if (rawMessage.type === "action-request") {
        const qualified = parseQualifiedTarget(rawMessage.request.element_id);
        if (!qualified || activeTabId === null) {
          return;
        }
        const executeMessage: BackgroundToContentMessage = {
          type: "execute-action",
          callId: rawMessage.callId,
          request: { ...rawMessage.request, element_id: qualified.localTarget },
        };
        void chrome.tabs
          .sendMessage(activeTabId, executeMessage, { frameId: qualified.frameId })
          .catch(() => undefined);
        return;
      }

      if (rawMessage.type === "usage-report") {
        void chrome.storage.local.get(["sessionToken"]).then(({ sessionToken }) => {
          if (!sessionToken) {
            return;
          }
          void fetch(`${BACKEND_URL}/api/extension/usage`, {
            method: "POST",
            headers: { authorization: `Bearer ${sessionToken}`, "content-type": "application/json" },
            body: JSON.stringify({ seconds: rawMessage.seconds }),
          }).catch(() => undefined);
        });
        return;
      }
    }
  }
});
