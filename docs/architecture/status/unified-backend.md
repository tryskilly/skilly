# Unified backend migration

- Base: current shipping main baeb574 plus deployed checkout repair 84a1fba. The old develop-only promotion guidance predates the backend already present on main.
- Owner: root agent, worktree /private/tmp/skilly-unified-backend, branch codex/unified-backend.
- Scope: Swift client endpoint routing, Studio local session verification, removal of Worker runtime fallback, usage integration, verification and release configuration.
- Other owners: codex/studio-desktop-auth owns desktop WorkOS routes; codex/studio-billing-owner owns personal checkout/portal/webhook handling, each in isolated worktrees.
- User constraint: no currently paying customers; consolidate runtime authentication, subscriptions, entitlement and usage in Studio/Postgres. Cloudflare may remain only for static CDN. Preserve account identities.
- State: locally verified migration candidate, not a completed production cutover. Worker shutdown follows verified backend/client availability; no shutdown or entitlement backfill yet.
- Verification: combined backend171 tests;30 isolated billing scenarios; real disposable PostgreSQL tests; TypeScript; Mac CI; Windows installer CI. Extension55 tests and Chrome/Firefox builds; marketing integration62 tests/clean build. Runtime source includes server start gates and durable account-bound usage reporting; see authority contract for soft-enforcement limits.
- Remaining blockers: verify exact production DB mapping and apply0010; WorkOS callback action-time approval; billing credential/live-flow verification; Vercel overdue warning; pinned Sparkle tools and signed release. No production cutover or Worker shutdown. See ../unified-backend-cutover.md.
