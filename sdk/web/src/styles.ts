// Scoped styles for the Shadow-DOM widget. `--skilly-accent` is set from the
// tenant config; every other visual value belongs to the visitor widget system.

export const WIDGET_STYLES = /* css */ `
:host {
  --skilly-accent: #F59E0B;
  --skilly-ink: #17120B;
  --skilly-surface: #171719;
  --skilly-surface-raised: #202023;
  --skilly-text: #FAFAFA;
  --skilly-muted: #A1A1AA;
  --skilly-border: rgba(255, 255, 255, 0.12);
  all: initial;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}

* { box-sizing: border-box; }
[hidden] { display: none !important; }
button, input { font: inherit; }
button:focus-visible, input:focus-visible, a:focus-visible {
  outline: 2px solid var(--skilly-accent);
  outline-offset: 2px;
}
.skilly-sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.skilly-launcher-shell {
  position: fixed;
  right: 20px;
  bottom: 20px;
  z-index: 2147483647;
}
.skilly-launcher-label {
  position: absolute;
  right: 68px;
  bottom: 9px;
  max-width: min(260px, calc(100vw - 116px));
  border: 1px solid var(--skilly-border);
  border-radius: 12px;
  padding: 9px 12px;
  background: rgba(23, 23, 25, 0.98);
  color: var(--skilly-text);
  font: 600 13px/1.25 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.28);
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
  transform: translateX(6px);
  transition: opacity 150ms ease, transform 150ms ease;
}
.skilly-launcher-shell:hover .skilly-launcher-label,
.skilly-launcher-shell:focus-within .skilly-launcher-label {
  opacity: 1;
  visibility: visible;
  transform: translateX(0);
}
.skilly-launcher {
  position: relative;
  width: 56px;
  height: 56px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 50%;
  padding: 0;
  background: var(--skilly-accent);
  color: var(--skilly-ink);
  cursor: pointer;
  display: grid;
  place-items: center;
  box-shadow: 0 14px 34px rgba(0, 0, 0, 0.24), 0 0 0 0 color-mix(in srgb, var(--skilly-accent) 35%, transparent);
  transition: transform 150ms ease, box-shadow 150ms ease;
}
.skilly-launcher:hover {
  transform: translateY(-2px) scale(1.025);
  box-shadow: 0 18px 38px rgba(0, 0, 0, 0.3), 0 0 0 4px color-mix(in srgb, var(--skilly-accent) 18%, transparent);
}
.skilly-launcher:active { transform: scale(0.97); }
.skilly-launcher svg { width: 29px; height: 29px; }
.skilly-launcher-mark { filter: drop-shadow(0 1px 1px rgba(255, 255, 255, 0.18)); }
.skilly-launcher[data-state="listening"]::after {
  content: "";
  position: absolute;
  inset: -8px;
  border: 2px solid var(--skilly-accent);
  border-radius: 50%;
  animation: skilly-pulse 1.3s ease-out infinite;
}
.skilly-launcher[data-state="connecting"]::after,
.skilly-launcher[data-state="thinking"]::after {
  content: "";
  position: absolute;
  inset: -5px;
  border: 2px solid transparent;
  border-top-color: var(--skilly-accent);
  border-radius: 50%;
  animation: skilly-spin 900ms linear infinite;
}
.skilly-launcher[data-state="error"],
.skilly-launcher[data-state="micDenied"],
.skilly-launcher[data-state="quotaDisabled"] {
  box-shadow: 0 14px 34px rgba(0, 0, 0, 0.24), 0 0 0 4px rgba(239, 68, 68, 0.18);
}
@keyframes skilly-pulse {
  0% { transform: scale(0.94); opacity: 0.76; }
  100% { transform: scale(1.48); opacity: 0; }
}
@keyframes skilly-spin { to { transform: rotate(360deg); } }

.skilly-bubble {
  position: fixed;
  left: 0;
  top: 0;
  width: min(380px, calc(100vw - 32px));
  border: 1px solid var(--skilly-border);
  border-radius: 18px;
  padding: 14px;
  background: rgba(23, 23, 25, 0.985);
  color: var(--skilly-text);
  box-shadow: 0 20px 58px rgba(0, 0, 0, 0.38);
  opacity: 0;
  pointer-events: none;
  transition: opacity 170ms ease, scale 170ms ease;
  scale: 0.98;
  z-index: 2147483647;
  will-change: transform;
}
.skilly-bubble[data-placement="fixed"] {
  left: auto;
  right: 20px;
  top: auto;
  bottom: 92px;
}
.skilly-bubble[data-visible="true"] {
  opacity: 1;
  pointer-events: auto;
  scale: 1;
}
.skilly-bubble-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
  cursor: grab;
  touch-action: none;
  user-select: none;
}
.skilly-bubble[data-dragging="true"] { transition: none; }
.skilly-bubble[data-dragging="true"] .skilly-bubble-header { cursor: grabbing; }
.skilly-header-actions { display: flex; align-items: center; gap: 4px; cursor: default; }
.skilly-status-lockup { display: flex; align-items: center; min-width: 0; gap: 8px; }
.skilly-status-dot {
  width: 7px;
  height: 7px;
  flex: 0 0 auto;
  border-radius: 50%;
  background: var(--skilly-accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--skilly-accent) 16%, transparent);
}
.skilly-bubble[data-state="error"] .skilly-status-dot,
.skilly-bubble[data-state="micDenied"] .skilly-status-dot,
.skilly-bubble[data-state="quotaDisabled"] .skilly-status-dot {
  background: #F87171;
  box-shadow: 0 0 0 3px rgba(248, 113, 113, 0.14);
}
.skilly-bubble-status {
  overflow: hidden;
  color: var(--skilly-text);
  font: 700 12px/1.2 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  letter-spacing: 0.01em;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.skilly-close,
.skilly-position-reset,
.skilly-history-toggle {
  width: 28px;
  height: 28px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  border: 1px solid transparent;
  border-radius: 9px;
  padding: 0;
  background: transparent;
  color: var(--skilly-muted);
  cursor: pointer;
}
.skilly-close:hover,
.skilly-position-reset:hover,
.skilly-history-toggle:hover,
.skilly-history-toggle[aria-pressed="true"] {
  border-color: var(--skilly-border);
  background: rgba(255, 255, 255, 0.07);
  color: var(--skilly-text);
}
.skilly-close svg,
.skilly-position-reset svg,
.skilly-history-toggle svg { width: 18px; height: 18px; }
.skilly-history-toggle { position: relative; }
.skilly-history-count {
  position: absolute;
  top: -5px;
  right: -5px;
  min-width: 16px;
  height: 16px;
  border: 2px solid var(--skilly-surface);
  border-radius: 999px;
  padding: 0 3px;
  display: grid;
  place-items: center;
  background: var(--skilly-accent);
  color: var(--skilly-ink);
  font: 800 9px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}
.skilly-guidance {
  margin-bottom: 12px;
  border: 1px solid color-mix(in srgb, var(--skilly-accent) 28%, var(--skilly-border));
  border-radius: 13px;
  padding: 11px;
  background: color-mix(in srgb, var(--skilly-accent) 7%, transparent);
}
.skilly-guidance-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
}
.skilly-guidance-title {
  min-width: 0;
  overflow: hidden;
  color: var(--skilly-text);
  font: 750 12px/1.25 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.skilly-guidance-summary {
  flex: 0 0 auto;
  color: var(--skilly-accent);
  font: 750 10px/1.2 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  letter-spacing: 0.02em;
  text-transform: uppercase;
}
.skilly-guidance-steps {
  margin: 10px 0 0;
  padding: 0;
  display: grid;
  gap: 7px;
  list-style: none;
}
.skilly-guidance-step { display: grid; grid-template-columns: 20px minmax(0, 1fr); align-items: center; gap: 8px; }
.skilly-guidance-marker {
  width: 20px;
  height: 20px;
  display: grid;
  place-items: center;
  border: 1px solid var(--skilly-border);
  border-radius: 50%;
  color: var(--skilly-muted);
  font: 750 10px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}
.skilly-guidance-label {
  color: var(--skilly-muted);
  font: 550 12px/1.35 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}
.skilly-guidance-step[data-step-state="current"] .skilly-guidance-marker {
  border-color: var(--skilly-accent);
  background: var(--skilly-accent);
  color: var(--skilly-ink);
}
.skilly-guidance-step[data-step-state="current"] .skilly-guidance-label { color: var(--skilly-text); font-weight: 700; }
.skilly-guidance-step[data-step-state="complete"] .skilly-guidance-marker {
  border-color: color-mix(in srgb, var(--skilly-accent) 52%, transparent);
  background: color-mix(in srgb, var(--skilly-accent) 14%, transparent);
  color: var(--skilly-accent);
}
.skilly-guidance-step[data-step-state="complete"] .skilly-guidance-label { color: #D4D4D8; }
.skilly-bubble-message {
  color: #E4E4E7;
  font: 450 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}
.skilly-bubble-message:empty { display: none; }
.skilly-conversation {
  margin-top: 12px;
  overflow: hidden;
  border: 1px solid var(--skilly-border);
  border-radius: 13px;
  background: rgba(255, 255, 255, 0.025);
}
.skilly-conversation-header {
  min-height: 34px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border-bottom: 1px solid var(--skilly-border);
  padding: 7px 10px;
  color: var(--skilly-muted);
  font: 700 10px/1.2 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.skilly-history-clear {
  border: 0;
  padding: 2px 0;
  background: transparent;
  color: var(--skilly-muted);
  cursor: pointer;
  font: 700 10px/1.2 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}
.skilly-history-clear:hover { color: var(--skilly-text); }
.skilly-conversation-messages {
  max-height: 210px;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-color: rgba(255, 255, 255, 0.2) transparent;
}
.skilly-conversation-message { padding: 9px 10px; }
.skilly-conversation-message + .skilly-conversation-message { border-top: 1px solid rgba(255, 255, 255, 0.07); }
.skilly-conversation-message[data-role="user"] { background: rgba(255, 255, 255, 0.025); }
.skilly-conversation-role {
  margin-bottom: 3px;
  color: var(--skilly-accent);
  font: 750 10px/1.2 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  letter-spacing: 0.03em;
  text-transform: uppercase;
}
.skilly-conversation-message[data-role="user"] .skilly-conversation-role { color: #A1A1AA; }
.skilly-conversation-text {
  color: #E4E4E7;
  font: 450 13px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}
.skilly-activity {
  height: 24px;
  display: none;
  align-items: center;
  gap: 4px;
  margin-top: 10px;
}
.skilly-bubble[data-state="connecting"] .skilly-activity,
.skilly-bubble[data-state="listening"] .skilly-activity,
.skilly-bubble[data-state="thinking"] .skilly-activity,
.skilly-bubble[data-state="speaking"] .skilly-activity { display: flex; }
.skilly-activity span {
  width: 3px;
  height: 8px;
  border-radius: 999px;
  background: var(--skilly-accent);
  animation: skilly-wave 900ms ease-in-out infinite alternate;
}
.skilly-activity span:nth-child(2) { animation-delay: -650ms; }
.skilly-activity span:nth-child(3) { animation-delay: -400ms; }
.skilly-activity span:nth-child(4) { animation-delay: -750ms; }
.skilly-activity span:nth-child(5) { animation-delay: -250ms; }
@keyframes skilly-wave { to { height: 22px; opacity: 0.55; } }

.skilly-consent-actions,
.skilly-notice-actions {
  display: none;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 14px;
}
.skilly-consent-actions[data-visible="true"],
.skilly-notice-actions[data-visible="true"] { display: flex; }
.skilly-button {
  min-height: 34px;
  border: 1px solid var(--skilly-border);
  border-radius: 10px;
  padding: 8px 11px;
  background: rgba(255, 255, 255, 0.06);
  color: var(--skilly-text);
  cursor: pointer;
  font: 700 12px/1.2 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}
.skilly-button:hover { background: rgba(255, 255, 255, 0.11); }
.skilly-button-primary { border-color: transparent; background: var(--skilly-accent); color: var(--skilly-ink); }
.skilly-button-primary:hover { filter: brightness(1.06); background: var(--skilly-accent); }

.skilly-text-form {
  display: none;
  grid-template-columns: minmax(0, 1fr) 34px;
  gap: 6px;
  margin-top: 12px;
}
.skilly-text-form[data-visible="true"] { display: grid; }
.skilly-text-input {
  min-width: 0;
  height: 34px;
  border: 1px solid var(--skilly-border);
  border-radius: 10px;
  padding: 0 10px;
  background: rgba(255, 255, 255, 0.055);
  color: var(--skilly-text);
  font: 500 13px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}
.skilly-text-input::placeholder { color: #71717A; }
.skilly-send {
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 10px;
  padding: 0;
  background: var(--skilly-accent);
  color: var(--skilly-ink);
  cursor: pointer;
}
.skilly-send:hover { filter: brightness(1.06); }
.skilly-send svg { width: 18px; height: 18px; }
.skilly-attribution {
  display: inline-flex;
  margin-top: 11px;
  color: #71717A;
  font: 600 10px/1.2 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  text-decoration: none;
}
.skilly-attribution:hover { color: var(--skilly-accent); }

.skilly-cursor {
  position: fixed;
  top: 0;
  left: 0;
  width: 31px;
  height: 31px;
  pointer-events: none;
  opacity: 0;
  color: var(--skilly-accent);
  transition: opacity 160ms ease;
  z-index: 2147483647;
  will-change: transform;
}
.skilly-cursor[data-visible="true"] { opacity: 1; }
.skilly-cursor svg { width: 100%; height: 100%; filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.42)); }

.skilly-pointer-caption {
  position: fixed;
  left: 0;
  top: 0;
  width: min(280px, calc(100vw - 32px));
  max-height: min(180px, calc(100vh - 32px));
  overflow: hidden;
  border: 1px solid var(--skilly-border);
  border-radius: 13px;
  padding: 10px 12px;
  background: rgba(23, 23, 25, 0.965);
  color: #F4F4F5;
  font: 550 13px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  box-shadow: 0 14px 36px rgba(0, 0, 0, 0.34);
  opacity: 0;
  pointer-events: none;
  transition: opacity 140ms ease;
  z-index: 2147483647;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
  will-change: transform;
}
.skilly-pointer-caption[data-visible="true"] { opacity: 1; }

.skilly-confirm {
  position: fixed;
  left: 0;
  top: 0;
  width: min(300px, calc(100vw - 32px));
  padding: 12px;
  border: 1px solid var(--skilly-border);
  border-radius: 14px;
  background: rgba(23, 23, 25, 0.985);
  color: var(--skilly-text);
  opacity: 0;
  pointer-events: none;
  box-shadow: 0 16px 42px rgba(0, 0, 0, 0.36);
  transition: opacity 160ms ease;
  z-index: 2147483647;
  will-change: transform;
}
.skilly-confirm[data-visible="true"] { opacity: 1; pointer-events: auto; }
.skilly-confirm-copy { color: var(--skilly-text); font: 600 13px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
.skilly-confirm-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 10px; }
.skilly-confirm-button {
  border: 1px solid var(--skilly-border);
  border-radius: 9px;
  padding: 7px 10px;
  background: rgba(255, 255, 255, 0.07);
  color: var(--skilly-text);
  cursor: pointer;
  font: 700 12px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}
.skilly-confirm-button:hover { background: rgba(255, 255, 255, 0.13); }
.skilly-confirm-primary { border-color: transparent; background: var(--skilly-accent); color: var(--skilly-ink); }
.skilly-confirm-primary:hover { background: var(--skilly-accent); filter: brightness(1.06); }

@media (max-width: 480px) {
  .skilly-launcher-shell { right: 16px; bottom: 16px; }
  .skilly-launcher-label { right: 64px; max-width: calc(100vw - 96px); }
  .skilly-bubble[data-placement="fixed"] { right: 16px; bottom: 88px; }
  .skilly-cursor { width: 27px; height: 27px; }
}

@media (prefers-reduced-motion: reduce) {
  .skilly-launcher,
  .skilly-launcher-label,
  .skilly-bubble,
  .skilly-cursor,
  .skilly-pointer-caption,
  .skilly-confirm { transition: none; }
  .skilly-launcher::after,
  .skilly-activity span { animation: none !important; }
  .skilly-activity span { height: 12px; opacity: 0.8; }
}
`;
