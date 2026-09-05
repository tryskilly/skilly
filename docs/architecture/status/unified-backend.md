# Unified backend migration

- Base: current shipping main baeb574 plus deployed checkout repair 84a1fba. The old develop-only promotion guidance predates the backend already present on main.
- Owner: root agent, worktree /private/tmp/skilly-unified-backend, branch codex/unified-backend.
- Scope: Swift client endpoint routing, Studio local session verification, removal of Worker runtime fallback, usage integration, verification and release configuration.
- Other owners: codex/studio-desktop-auth owns desktop WorkOS routes; codex/studio-billing-owner owns personal checkout/portal/webhook handling, each in isolated worktrees.
- User constraint: no currently paying customers; consolidate runtime authentication, subscriptions, entitlement and usage in Studio/Postgres. Cloudflare may remain only for static CDN. Preserve account identities.
- State: locally verified migration candidate, not a completed production cutover. Worker shutdown follows verified backend/client availability; no shutdown or entitlement backfill yet.
- Verification: backend suite 152 passed; 30 isolated personal billing route scenarios passed; TypeScript passed; final production-mode Next build passed; Swift parser passed; independent reviewer ran Windows backend client tests (9 passed).
- Remaining blockers: missing Studio personal product/callback settings; unverified WorkOS callback and Polar webhook delivery; database/schema/account parity not verified; client-side quota authority and missing Windows usage reporting; signed desktop releases still required. See ../unified-backend-cutover.md.
