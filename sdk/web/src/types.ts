// Public types for the @skilly/web embed SDK.

/** Companion visual state — drives the launcher + cursor appearance. */
export type SkillyState = "idle" | "listening" | "thinking" | "speaking";

/** Events the host page can subscribe to via `Skilly.on(...)`. */
export interface SkillyEventMap {
  /** Companion opened / a turn started. */
  turn: { goal?: string };
  /** The AI asked to point at an element (resolved selector + label). Wired in Phase 8.2. */
  point: { selector: string; label: string };
  /** A turn finished (response complete). */
  complete: { transcript?: string };
  /** Non-fatal error surfaced to the host. */
  error: { message: string };
}

export type SkillyEventName = keyof SkillyEventMap;
export type SkillyEventHandler<EventName extends SkillyEventName> = (
  payload: SkillyEventMap[EventName],
) => void;

/** Configuration passed to `Skilly.init(...)` (or via `data-skilly-*` script attributes). */
export interface SkillyConfig {
  /** Publishable tenant key (`pk_...`). Origin-locked; mints ephemeral tokens via the backend. */
  key: string;
  /** The site owner's authored skill id (their product knowledge / curriculum). */
  skill?: string;
  /** Accent color for the companion UI. Defaults to Skilly blue. */
  accentColor?: string;
  /** Short launcher prompt shown next to the floating icon. */
  launcherLabel?: string;
  /** BCP-47 locale hint for the companion (e.g. "en", "ar"). */
  locale?: string;
  /**
   * URL of the WASM core JS module (`skilly_core_web_sdk.js`). When set, the
   * shared Rust core (policy / skills / realtime) is loaded in the browser.
   * Optional in the 8.1 skeleton — the widget renders without it.
   */
  coreUrl?: string;
  /** Backend base URL that mints runtime tokens + serves the tenant skill. */
  backendUrl?: string;
}
