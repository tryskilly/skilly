# Studio-only runtime cutover

## Decision and scope

User direction, 2026-09-05: no current paying customers; finish the existing migration and make Studio/Postgres the sole runtime authority. Keep WorkOS as the identity provider and Polar as the payment provider. Cloudflare can remain for static SDK/CDN delivery, but not authentication, checkout, entitlements or token relay.

The candidate Mac and Windows source targets `https://studio.tryskilly.app/api/mac`. Extension and Builders already target Studio. Candidate desktop session validation is local; no candidate request falls back to Worker. Installed v3.0 still depends on Worker. The old Keychain slot name is retained to preserve stored sessions, not as a second backend.

## Runtime ownership

| Concern | Authoritative service |
| --- | --- |
| Desktop sign-in/exchange/refresh | Studio `/api/mac/auth/*` → WorkOS |
| Personal checkout and billing portal | Studio `/api/mac/{checkout,portal}` and extension equivalents → Polar |
| Personal subscription access records | Postgres `mac_entitlements`, keyed by WorkOS ID |
| Subscription updates | Signed Polar events → Studio `/api/web/webhooks/polar` |
| Hosted Realtime token minting | Studio desktop/extension/Builders routes → OpenAI |
| Session-start access and usage | Studio → Postgres, issued-session period binding and duplicate-safe reports; desktop counters remain a local UX cache |
| Builders static SDK bundle | Existing CDN; no account/billing authority |

## Configuration and verification status — September 6

Configuration agent inspected Vercel project `skilly-studio` (`prj_09sDeMRd3ZkcntwMo5S2B1Kz5VcW`), WorkOS and Neon through the owner's logged-in Chrome session:

- Saved Production `WORKOS_MAC_REDIRECT_URI=https://studio.tryskilly.app/api/mac/auth/callback`. WorkOS registration of that additional callback remains pending user action-time approval; preserve the existing four callbacks.
- Saved Production `POLAR_MAC_PRODUCT_ID=2706ed5f-04b2-4429-a62a-27f9bd9f1ec9` after verifying the active $19/month Skilly Pro catalog product. Do not substitute the Builders `POLAR_PRODUCT_ID`. Saved variables require redeployment to take effect.
- Session secret, WorkOS credentials, Polar credentials/webhook secret and database variables exist. Presence is **not** proof of correct values, database migrations or webhook registration.
- Polar Studio webhook is enabled at the correct URL with all six required subscription events selected. A historical HTTP200 delivery returned `applied:false`; do not replay stale active events. The token named `studio-token` is expired; its association with deployed configuration remains unverified.
- Neon project `skilly Admin`, production branch, database `neondb`, endpoint `ep-nameless-waterfall-adysvbgj`: read-only metadata found migrations0000–0009, zero entitlement rows and66 usage rows. Migration0010 is absent. Vercel Production `POSTGRES_URL` is explicitly type`sensitive`; no value was read. Neon shows no connected Vercel integration. Therefore the production database mapping still requires confirmation before changing this database.
- Vercel shows an overdue-invoice/account-shutdown warning; no payment was attempted.
- Downloading all production secrets to a temporary file for database checks was rejected by the safety reviewer. No secret download or indirect workaround was performed. Prefer a narrowly authorized database read through the existing connection or provider console; broad secret export is not necessary.

## Cutover gates, in order

1. Review the combined source and pass CI. The selected parallel Studio repair `bcd641f3` is included; do not import unrelated older ancestors from its source branch. Keep the deployed legacy checkout repair available during transition.
2. Confirm the exact production database and apply the additive `0010_personal_access_authority` migration after verifying0008/0009. Preserve existing records; reconcile current Polar status before any historical backfill. Never resurrect canceled access with stale events.
3. Verify the saved settings, WorkOS callback registration, active billing credentials and hosting continuity. Keep Builders and BYOK product identities distinct. Database/schema readiness must precede a main merge that automatically deploys Studio.
4. Merge/deploy Studio, then the verified marketing integration; verify real test-account login, token refresh, entitlement lookup, checkout URL creation (no charge), draft handoff/save and signed webhook persistence. Missing database/schema must fail rather than return a false success.
5. Build, sign, notarize and release desktop clients. Mac syntax checks are not a signed-app build. Windows source checks are not an installer test. Existing release tooling still needs its normal signing and release verification.
6. Verify an installed released client completes sign-in, a first teaching turn, and the upgrade flow against Studio. Confirm usage reaches the same backend and no runtime request hits Worker.
7. Only then retire Worker routes and KV after retaining a recovery copy and checking legacy client traffic. Do not delete Cloudflare DNS/CDN assets as part of runtime retirement.

## Known follow-up risks

- The candidate implements server-owned session-start decisions, trial/paid accounting, issued-session period binding, durable account-bound client reporting and native operator access preservation. Direct OpenAI sessions cannot be terminated by credential expiry; client reports remain untrusted and concurrent starts do not reserve future duration. This is not a hard provider-side spending cap. A one-time local trial preservation floor is not cryptographic usage proof.
- Historical customer records and installed old clients may remain even with zero current paying customers.
- No real payment or customer outreach is part of verification. No paid conversion lift is claimed.
- The existing Builders portal implementation warrants its own provider-contract check; personal routes must not inherit its old endpoint assumption.

Status: implementation candidate. Production cutover, database reconciliation, provider callback/webhook verification, signed desktop release and Worker retirement remain gated; not complete.

## Candidate evidence

- Combined backend:171 tests/typecheck passed; isolated billing contracts and real local PostgreSQL migration/accounting scenarios passed without production access.
- Native client:66 Rust tests; integrated Mac CI and Windows installer packaging passed atb33f644. Extension:55 tests, typecheck, Chrome/Firefox builds.
- Marketing integration retains owner baseline417df01, repair7045f006 and current-main functional changes;62 tests and clean build passed.
- Release helper tests pass; monotonic build validation now uses appcast/project floor, not release count. Developer ID and notarization profile are available; pinned Sparkle2.9.0 tools still need preparation. No signed release or Worker retirement has happened.
