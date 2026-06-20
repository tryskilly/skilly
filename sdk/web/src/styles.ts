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

.skilly-launcher-label {
  position: fixed;
  right: 88px;
  bottom: 28px;
  max-width: min(260px, calc(100vw - 116px));
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: 999px;
  padding: 9px 13px;
  background: rgba(255, 255, 255, 0.96);
  color: #111827;
  cursor: pointer;
  font: 600 13px/1.2 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.14);
  transition: transform 0.15s ease, box-shadow 0.15s ease, opacity 0.15s ease;
  z-index: 2147483647;
}
.skilly-launcher-label:hover {
  transform: translateY(-1px);
  box-shadow: 0 14px 34px rgba(15, 23, 42, 0.2);
}
.skilly-launcher-label[data-state="listening"],
.skilly-launcher-label[data-state="speaking"],
.skilly-launcher-label[data-state="thinking"] {
  color: #7c2d12;
  border-color: rgba(245, 158, 11, 0.24);
}

/* Floating launcher button, bottom-right. */
.skilly-launcher {
  position: fixed;
  right: 20px;
  bottom: 20px;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  border: 1px solid rgba(245, 158, 11, 0.28);
  cursor: pointer;
  background: #fff;
  color: var(--skilly-accent);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.18);
  transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
  z-index: 2147483647;
}
.skilly-launcher:hover {
  transform: scale(1.06);
  border-color: rgba(245, 158, 11, 0.5);
  box-shadow: 0 14px 36px rgba(15, 23, 42, 0.24);
}
.skilly-launcher:active { transform: scale(0.97); }
.skilly-launcher svg { width: 34px; height: 34px; }
.skilly-launcher-mark { filter: drop-shadow(0 1px 1px rgba(15, 23, 42, 0.12)); }

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
.skilly-bubble[data-visible="true"] {
  opacity: 1;
  pointer-events: auto;
  transform: translateY(0);
}
.skilly-bubble-message {
  color: #F2F2F7;
}
.skilly-attribution {
  display: inline-flex;
  margin-top: 9px;
  color: rgba(242, 242, 247, 0.58);
  font: 600 11px/1.2 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  text-decoration: none;
}
.skilly-attribution:hover {
  color: #FCD34D;
  text-decoration: underline;
}

/* Blue cursor companion that flies to and points at host UI (animation = Phase 8.2). */
.skilly-cursor {
  position: fixed;
  top: 0;
  left: 0;
  width: 22px;
  height: 22px;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.2s ease;
  z-index: 2147483647;
  will-change: transform;
}
.skilly-cursor[data-visible="true"] { opacity: 1; }
.skilly-cursor svg { width: 100%; height: 100%; filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3)); }

@media (max-width: 480px) {
  .skilly-launcher {
    right: 16px;
    bottom: 16px;
  }
  .skilly-launcher-label {
    right: 80px;
    bottom: 24px;
    max-width: calc(100vw - 104px);
    padding-inline: 11px;
  }
  .skilly-bubble {
    right: 16px;
    bottom: 84px;
    max-width: calc(100vw - 32px);
  }
}
`;
