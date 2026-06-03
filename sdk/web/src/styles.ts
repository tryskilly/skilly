// Scoped styles for the Shadow-DOM widget. Injected into the shadow root so
// nothing here leaks into — or is affected by — the host page's CSS.
//
// `--skilly-accent` is set at runtime from SkillyConfig.accentColor.

export const WIDGET_STYLES = /* css */ `
:host {
  --skilly-accent: #2F6BFF;
  all: initial;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}

* { box-sizing: border-box; }

/* Floating launcher button, bottom-right. */
.skilly-launcher {
  position: fixed;
  right: 20px;
  bottom: 20px;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  border: none;
  cursor: pointer;
  background: var(--skilly-accent);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.25);
  transition: transform 0.15s ease, box-shadow 0.15s ease;
  z-index: 2147483647;
}
.skilly-launcher:hover { transform: scale(1.06); box-shadow: 0 8px 26px rgba(0, 0, 0, 0.3); }
.skilly-launcher:active { transform: scale(0.97); }
.skilly-launcher svg { width: 26px; height: 26px; }

/* Pulsing ring shown while listening. */
.skilly-launcher[data-state="listening"]::after {
  content: "";
  position: absolute;
  inset: -6px;
  border-radius: 50%;
  border: 2px solid var(--skilly-accent);
  animation: skilly-pulse 1.2s ease-out infinite;
}
@keyframes skilly-pulse {
  0% { transform: scale(1); opacity: 0.7; }
  100% { transform: scale(1.5); opacity: 0; }
}

/* Response bubble that floats above the launcher. */
.skilly-bubble {
  position: fixed;
  right: 20px;
  bottom: 88px;
  max-width: 320px;
  padding: 14px 16px;
  border-radius: 16px;
  background: #1C1C1E;
  color: #F2F2F7;
  font-size: 14px;
  line-height: 1.45;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
  opacity: 0;
  transform: translateY(8px);
  pointer-events: none;
  transition: opacity 0.2s ease, transform 0.2s ease;
  z-index: 2147483647;
}
.skilly-bubble[data-visible="true"] { opacity: 1; transform: translateY(0); }

/* Blue cursor companion that flies to and points at host UI (animation = Phase 8.2). */
.skilly-cursor {
  position: fixed;
  top: 0;
  left: 0;
  width: 22px;
  height: 22px;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.2s ease, transform 0.35s cubic-bezier(0.22, 1, 0.36, 1);
  z-index: 2147483647;
  will-change: transform;
}
.skilly-cursor[data-visible="true"] { opacity: 1; }
.skilly-cursor svg { width: 100%; height: 100%; filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3)); }
`;
