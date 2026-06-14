# Status — `feature/backend-dashboard-completeness`

> Coordination note per `parallel-agent-guidelines.md` §1.5. If you are another
> agent working in the **Backend (Next.js)** lane (`apps/web-backend/**`), read
> this before editing those files.

- **Base branch:** `origin/develop` @ `5cbcd7b`
- **Work branch:** `feature/backend-dashboard-completeness`
- **Worktree:** `../skilly-backend-completeness` (isolated — not the main checkout)
- **Lane:** Backend (Next.js) — `apps/web-backend/**`
- **Agent:** ZCode session (started 2026-06-15)
- **State:** **ready for review** — all gaps closed, validated green

## Intent

Close the gaps surfaced by a dashboard audit after commit `5cbcd7b`. Scope:

1. **Repo layer** — add `listDashboardMemberships`, `deleteDashboardMembership`,
   `createTenant`, `updateTenantName` (memory + postgres + tests). The upsert
   method already exists but is unreached.
2. **Super-admin surface** — create tenant, adjust usage cap, member management
   (add/remove tenant_admin). Today the admin page is read-only.
3. **Polar customer portal route** — `POST /api/web/portal`; wire `BillingCard`
   "Manage plan" → portal (not a fresh checkout).
4. **Widget config page** — snippet generator (real publishable key) + theme /
   trigger / voice / lang controls with persistence.
5. **Usage breakdowns** — surface `token_mint` events, not just monthly seconds.
6. **Polish** — stale "WorkOS follow-up" copy, conditional "Needs setup" badge,
   "Test widget" setup step, tenant switcher for multi-membership users.

## Files I will touch

- `apps/web-backend/src/db/repo.ts` (interface additions)
- `apps/web-backend/src/db/memoryRepo.ts`, `postgresRepo.ts` (impls)
- `apps/web-backend/src/app/dashboard/admin/**` (mutations + drill-in)
- `apps/web-backend/src/app/dashboard/actions.ts` (new actions)
- `apps/web-backend/src/app/api/web/portal/route.ts` (new)
- `apps/web-backend/src/app/dashboard/billing/**`, `BillingCard.tsx`
- `apps/web-backend/src/app/dashboard/widget/**` (config)
- `apps/web-backend/src/app/dashboard/usage/**`, a usage repo method
- `apps/web-backend/src/app/dashboard/page.tsx`, `settings/page.tsx`,
  `DashboardShell.tsx` (polish)
- `apps/web-backend/db/schema.ts` + a new Drizzle migration (if any new columns)
- `apps/web-backend/tests/*` (new tests for all of the above)
- `apps/web-backend/README.md`, root `AGENTS.md` (doc drift)

## Validation

- `bun test` — **59/59 passing** (was 49)
- `bun run typecheck` — clean
- `bun run build` — clean; all routes compile (incl. new `/dashboard/admin/tenants/[tenantId]` + `/api/web/portal`)

## What landed

1. ✅ Repo layer: `listUsageEvents`, `createTenant`, `updateTenantName`, `listDashboardMemberships`, `deleteDashboardMembership` (refuses last super_admin), `setTenantPolarCustomerId`, widget config get/save — memory + postgres + tests.
2. ✅ Super-admin surface: create-tenant form, per-tenant cap/rename controls, member-management drill-in page (`/dashboard/admin/tenants/[tenantId]`) with add/remove member + last-super-admin guard.
3. ✅ Polar customer portal: `POST /api/web/portal`; webhook now captures `polar_customer_id`; `BillingCard` "Manage plan" → portal (falls back to checkout for first-timers). Migration `0001` adds `tenants.polar_customer_id`.
4. ✅ Widget config: accent/locale/launcher-label form with live preview + generated snippet (real publishable key). New `tenant_widget_configs` table, migration `0002`.
5. ✅ Usage breakdowns: recent-events table (token mints + session seconds) + event-kind counts.
6. ✅ Polish: stale WorkOS copy fixed; "Needs setup" badge now conditional + links to install; "Test widget" step satisfiable; super-admin tenant switcher in the sidebar.

## Blockers

None.
