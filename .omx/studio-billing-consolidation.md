# Studio billing consolidation

## Implemented

- Added Studio-backed `/api/mac/checkout` and `/api/mac/portal` routes.
- Added equivalent `/api/extension/checkout` and `/api/extension/portal` routes.
- Personal checkout metadata is authoritative from the verified session: `surface`, `user_id`, `email`, and a generated or supplied `checkout_attempt_id`.
- Product selection uses `POLAR_MAC_PRODUCT_ID`, with `POLAR_BETA_PRODUCT_ID` as the documented transition fallback. Builders continue to use their own product catalog.
- Checkout is blocked when `mac_entitlements` contains a current active entitlement. Portal sessions require the stored `polar_customer_id`.
- Polar personal Mac subscription webhooks now upsert the shared `mac_entitlements` record as `relay`; Builders and BYOK handling remain separate.

## Verification

- `bun test tests/billing.test.ts` — 15 passed.
- `git diff --check` — passed.

## Remaining migration work

- Ship the client changes that call Studio routes and remove Worker fallback in the parent integration.
- Add production `POLAR_MAC_PRODUCT_ID` and register the Studio webhook endpoint/secret.
- Validate a real authenticated checkout and portal session after deployment; no payment was made in this slice.
- Extend entitlement status storage if the client needs to distinguish `past_due` and `revoked` beyond inactive access.
