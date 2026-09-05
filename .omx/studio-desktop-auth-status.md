# Studio desktop auth slice

## Scope

Studio-only WorkOS AuthKit flow for the macOS client. Cloudflare Worker is not called by these routes.

## Implemented

- `/api/mac/auth/url` validates a bounded client OAuth state and builds WorkOS AuthKit authorization URL.
- `/api/mac/auth/callback` validates code/state and redirects only to `skilly://auth/callback` via an HTML handoff.
- `/api/mac/auth/token` exchanges authorization codes and refresh tokens with WorkOS and returns Swift-compatible `AuthResponse` fields.
- Studio signs desktop sessions with `SESSION_TOKEN_SECRET`, issuer `skilly-studio`, audience `skilly-desktop`, 30-day expiry.

## Verification

`bun test tests/desktopAuth.test.ts` passes with mocked WorkOS HTTP responses. No credentials or authorization codes are logged.

## Integration contract

Mac verification must accept HMAC-SHA256 JWT-like tokens whose payload contains `sub`, `email`, `iat`, `exp`, `iss: "skilly-studio"`, and `aud: "skilly-desktop"`, signed with `SESSION_TOKEN_SECRET`.
