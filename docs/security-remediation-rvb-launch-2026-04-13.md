# Security Remediation Status (RVB Launch)

Date: 2026-04-13

## Fixed in Code

- Worker route auth gate added for sensitive routes:
  - `/openai/token`, `/checkout/create`, `/entitlement`, `/portal`
  - legacy `/chat`, `/tts`, `/transcribe-token`
- `/openai/token` no longer returns raw `OPENAI_API_KEY`; now mints short-lived Realtime client secrets.
- OAuth CSRF hardening:
  - app generates OAuth `state`
  - worker forwards `state`
  - app validates callback `state` before token exchange
- Worker session tokens:
  - issued by `/auth/token`
  - verified via HMAC on protected worker routes
  - stored in Keychain (`ThisDeviceOnly`) by the app
- Webhook replay hardening:
  - timestamp skew check added (`±5 min`) before signature acceptance
- Dependency posture:
  - upgraded `wrangler` to `^4.81.1`
  - `npm audit` now clean (0 vulnerabilities)
- Open-source/compliance artifacts added:
  - `SECURITY.md`
  - `THIRD_PARTY_NOTICES.md`
  - `docs/privacy-data-inventory.md`

## Verification Performed

- `npx wrangler deploy --dry-run` succeeds with new worker code.
- Local worker endpoint checks (wrangler dev):
  - unauthenticated `/openai/token` returns `401`
  - invalid OAuth state on `/auth/url` returns `400`
  - unauthenticated `/entitlement` returns `401`
- `npm audit --json` and `npm audit --omit=dev --json` both return 0 vulnerabilities.

## Remaining Operational Steps (Non-Code)

- Set worker secret in deployed environment:
  - `SESSION_TOKEN_SECRET`
- Deploy updated worker and app.
- Rotate existing production secrets after deployment (`OPENAI_API_KEY`, other exposed keys).
- Update platform privacy labels using `docs/privacy-data-inventory.md`.
