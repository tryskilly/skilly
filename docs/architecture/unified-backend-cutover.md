# Studio-only runtime cutover

## Decision and scope

User direction, 2026-09-05: no current paying customers; finish the existing migration and make Studio/Postgres the sole runtime authority. Keep WorkOS as the identity provider and Polar as the payment provider. Cloudflare can remain for static SDK/CDN delivery, but not authentication, checkout, entitlements or token relay.

Mac and Windows source now target `https://studio.tryskilly.app/api/mac`. Extension and Builders already target Studio. Desktop session validation is local; no request falls back to Worker. The old Keychain slot name is retained to preserve stored sessions, not as a second backend.

## Runtime ownership

| Concern | Authoritative service |
| --- | --- |
| Desktop sign-in/exchange/refresh | Studio `/api/mac/auth/*` → WorkOS |
| Personal checkout and billing portal | Studio `/api/mac/{checkout,portal}` and extension equivalents → Polar |
| Personal subscription access records | Postgres `mac_entitlements`, keyed by WorkOS ID |
| Subscription updates | Signed Polar events → Studio `/api/web/webhooks/polar` |
| Hosted Realtime token minting | Studio desktop/extension/Builders routes → OpenAI |
| Usage event storage | Studio → Postgres; existing desktop trial/monthly UI counters remain local |
| Builders static SDK bundle | Existing CDN; no account/billing authority |

## Verified configuration gaps

Production environment **names only** were inspected for Vercel project `skilly-studio` (`prj_09sDeMRd3ZkcntwMo5S2B1Kz5VcW`). On September 5:

- `WORKOS_MAC_REDIRECT_URI` is absent. It must be `https://studio.tryskilly.app/api/mac/auth/callback`, with the identical callback registered in the existing production WorkOS app.
- Both `POLAR_MAC_PRODUCT_ID` and fallback `POLAR_BETA_PRODUCT_ID` are absent. The legacy Worker configuration names product `2706ed5f-04b2-4429-a62a-27f9bd9f1ec9`; verify the product before setting Studio's dedicated personal product variable. Do not substitute the Builders `POLAR_PRODUCT_ID`.
- Session secret, WorkOS credentials, Polar credentials/webhook secret and database variables exist. Presence is **not** proof of correct values, database migrations or webhook registration.
- Downloading all production secrets to a temporary file for database checks was rejected by the safety reviewer. No secret download or indirect workaround was performed. Prefer a narrowly authorized database read through the existing connection or provider console; broad secret export is not necessary.

## Cutover gates, in order

1. Review and merge the consolidated source. Keep the already-deployed legacy checkout repair available during transition.
2. Configure the two missing settings, verify WorkOS callback registration, and verify the personal Polar product and Studio webhook event subscriptions. Keep Builders and BYOK product identities distinct.
3. Verify migrations `0008_mac_backend_parity` and `0009_mac_byok_telemetry` and account identity continuity. Reconcile historical subscription records with current Polar status before any backfill; do not resurrect expired/canceled access from stale KV.
4. Deploy Studio; verify a real test-account login, token refresh, entitlement lookup, checkout URL creation (no charge), portal contract where applicable, and signed webhook persistence. Missing database/schema must fail rather than return a false success.
5. Build, sign, notarize and release desktop clients. Mac syntax checks are not a signed-app build. Windows source checks are not an installer test. Existing release tooling still needs its normal signing and release verification.
6. Verify an installed released client completes sign-in, a first teaching turn, and the upgrade flow against Studio. Confirm usage reaches the same backend and no runtime request hits Worker.
7. Only then retire Worker routes and KV after retaining a recovery copy and checking legacy client traffic. Do not delete Cloudflare DNS/CDN assets as part of runtime retirement.

## Known follow-up risks

- This change removes backend routing fragmentation; it does not replace existing client-side trial/monthly counters with server-side enforcement. Desktop and extension token routes currently require authentication but do not enforce paid access/trial budget themselves. Windows keeps usage locally and has no backend usage submission. Centralized access/quota enforcement and Windows reporting are required before declaring the backend the sole source of truth; they are not complete in this candidate.
- Historical customer records and installed old clients may remain even with zero current paying customers.
- No real payment or customer outreach is part of verification. No paid conversion lift is claimed.
- The existing Builders portal implementation warrants its own provider-contract check; personal routes must not inherit its old endpoint assumption.

Status: implementation candidate. Production cutover, database reconciliation, provider callback/webhook verification, signed desktop release and Worker retirement remain gated; not complete.
