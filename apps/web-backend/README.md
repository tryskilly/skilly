# @skilly/web-backend

Multi-tenant control plane for the Skilly web SDK — **Next.js (App Router) +
Postgres**. Mints ephemeral OpenAI tokens for the `@skilly/web` widget, serves
tenant skills, and meters usage. This is the multi-tenant successor to the
Cloudflare Worker's `/openai/token`. See `docs/architecture/web-sdk-prd.md`.

## Status — Phases 8.4 → 8.6 (web SDK control plane complete)

Control plane (8.4):
- `POST /api/web/token` — validate publishable key + origin + quota → mint an
  ephemeral OpenAI Realtime client secret (raw `OPENAI_API_KEY` stays server-side).
- `GET /api/web/skill?skill=<id>` — serve the tenant's compiled SKILL.md.
- `GET /api/health` — readiness: dashboard auth configured, repo reachable,
  and the configured tenant exists.
- Drizzle migrations in `db/migrations` generated from `src/db/schema.ts`
  (tenants, api_keys, tenant_skills, usage_events, dashboard_memberships).

Dashboard (8.5) — Next.js + Tailwind:
- `/dashboard` — overview with a setup checklist, usage, and quick links.
- `/dashboard/install` — embed snippet + connection checklist.
- `/dashboard/widget` — **widget config** (accent color, language, launcher
  label) with a live preview; the settings flow into the generated embed
  snippet (`data-skilly-accent` / `data-skilly-locale` / `data-skilly-launcher`).
- `/dashboard/origins` — allowed web origins and native app IDs.
- `/dashboard/keys` — publishable/secret key management (one-time reveal, revoke).
- `/dashboard/skill` — author the SKILL.md, **safety-scanned** before save
  (`domain/skillValidation.ts` — size limits + injection/exfiltration phrases +
  raw-URL check; the desktop counterpart is `SkillValidation.swift`).
- `/dashboard/usage` — monthly meter + a recent-events table (token mints +
  session seconds) derived from `usage_events`.
- `/dashboard/admin/tenants` — **super-admin** tenant directory: create tenants,
  adjust monthly caps, rename, and drill into per-tenant member management
  (`/dashboard/admin/tenants/[tenantId]`). A super_admin can also switch the
  active tenant from the sidebar.
- Auth: dashboard pages and mutations are gated by a signed HTTP-only session
  cookie. Production login uses WorkOS AuthKit and resolves users through
  `dashboard_memberships` so a WorkOS user/organization maps to an explicit
  tenant and role. `SKILLY_DASHBOARD_PASSWORD` remains an emergency fallback.

Billing + metering (8.6):
- `POST /api/web/usage` — the widget reports session seconds → `usage_events`
  (the quota engine already reads these).
- `POST /api/web/webhooks/polar` — Standard-Webhooks-verified subscription events
  set the tenant's `usage_cap_seconds` by plan and persist the Polar customer id
  (`domain/billing.ts`).
- `POST /api/web/checkout` — start a Polar checkout (tenant id in metadata).
- `POST /api/web/portal` — open a Polar **customer-portal** session for the
  current tenant (requires a stored `polar_customer_id`; falls back to checkout
  for first-time upgrades). The Billing page's "Manage plan" routes here.
- Dashboard shows the current plan + Manage/Upgrade.

The `@skilly/web` widget (8.3) calls `/api/web/token` to get the secret it connects
to OpenAI Realtime with, and `/api/web/usage` to meter the session.

Env (billing): `POLAR_ACCESS_TOKEN`, `POLAR_PRODUCT_ID`, `POLAR_WEBHOOK_SECRET`,
`POLAR_PLAN_CAP_SECONDS` (ports the Worker's Polar setup).

Env (analytics): `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST`,
`POSTHOG_PROJECT_API_KEY`, `POSTHOG_HOST`, `NEXT_PUBLIC_GA_MEASUREMENT_ID`,
`GA_MEASUREMENT_ID`, `GA_API_SECRET`. See `docs/analytics-tracking-plan.md`.

## Architecture

- `src/domain/*` — pure, unit-tested logic: key format/hash (`keys`), origin
  allowlist incl. `*.domain` wildcards (`origin`), usage quota (`quota`), and the
  OpenAI mint with injectable `fetch` (`openaiToken`).
- `src/db/*` — a `WebBackendRepo` interface with a Postgres impl (`pg`) and an
  in-memory impl (seeded demo tenant) used in dev + tests. `getRepo()` picks
  Postgres when `DATABASE_URL` is set, else in-memory. The Postgres schema is
  defined with Drizzle ORM (`src/db/schema.ts`) and migrated via
  `db/migrations` (`bun run db:generate` / `bun run db:migrate`).
- `dashboard_memberships` — maps WorkOS user IDs and optional WorkOS organization
  IDs to tenant roles. The dashboard must use this table for multi-tenancy; do
  not infer tenant access directly from a signed-in WorkOS user.
- `src/tenantService.ts` — framework-free auth + mint orchestration.
- `src/app/api/**` — thin Next route handlers (CORS + extract key/origin → service).

## Develop

```bash
cd apps/web-backend
bun install
bun run db:migrate
psql "$DATABASE_URL" -f db/seed-demo.sql  # local/demo only
bun run test        # bun test — domain + service flow (no DB/network needed)
bun run typecheck   # tsc --noEmit (src)
bun run build       # next build
bun run dev         # next dev on :4310 (in-memory demo tenant if no DATABASE_URL)
```

Env: `OPENAI_API_KEY` (required to mint), `POSTGRES_URL` or `DATABASE_URL`
(optional — in-memory demo tenant without it). `POSTGRES_URL` takes precedence
when both are present, which is useful when a platform has a stale managed
`DATABASE_URL`. The seeded demo publishable key + allowed origins let the local
`@skilly/web` demo connect. `node_modules/`, `.next/`, `.env*` are gitignored.

Local dashboard auth:

- URL: `http://localhost:4310/dashboard`
- Default dev fallback password: `skilly-local`
- Seeded demo publishable key: `pk_test_demolocaldemolocaldemolocal01`
- Optional local overrides:
  - `WORKOS_CLIENT_ID`
  - `WORKOS_API_KEY`
  - `WORKOS_DASHBOARD_REDIRECT_URI` (`http://localhost:4310/api/auth/workos/callback`)
  - `SKILLY_DASHBOARD_PASSWORD`
  - `SKILLY_DASHBOARD_SESSION_SECRET`
  - `SKILLY_DASHBOARD_ROLE` (`super_admin` or `tenant_admin`)

## Deploy on Netlify

Deploy this app as a separate Netlify site from the Astro marketing site. Keep it
under the same Netlify team/account, but use its own project so dashboard/API
runtime settings and secrets stay isolated from `tryskilly.app`.

Recommended Netlify settings:

- Base directory: `apps/web-backend`
- Build command: `bun run build`
- Publish directory: `.next`
- Node version: `20`
- Production domain: `studio.tryskilly.app`

`apps/web-backend/netlify.toml` contains the build command, publish directory,
Node version, and `NETLIFY_NEXT_SKEW_PROTECTION=true`. Netlify's Next.js support
uses the OpenNext adapter automatically, so do not pin a legacy Next plugin
unless a Netlify support issue requires it.

Required production environment variables:

- `OPENAI_API_KEY`
- `POSTGRES_URL` or `DATABASE_URL` — use an external Postgres provider with
  SSL/pooling suitable for serverless connections. `POSTGRES_URL` takes
  precedence.
- `WORKOS_CLIENT_ID`
- `WORKOS_API_KEY`
- `WORKOS_DASHBOARD_REDIRECT_URI`
- `SKILLY_DASHBOARD_SESSION_SECRET`
- `SKILLY_DASHBOARD_PASSWORD` (optional emergency fallback)

WorkOS dashboard auth uses a browser callback on the web-backend, exchanges the
authorization code server-side, resolves `{ workos_user_id,
workos_organization_id? }` through `dashboard_memberships`, then issues the
HTTP-only dashboard session cookie with the resolved `tenantId` and `role`. The
desktop app's Worker flow redirects to `skilly://auth/callback` and is not the
right callback for the web dashboard.

WorkOS dashboard redirect URI:

- `https://studio.tryskilly.app/api/auth/workos/callback`
- Temporary deploy URL callbacks may be added during DNS rollout.

Production database setup:

- Preferred: run `bun run db:migrate` against Neon, then seed the initial
  tenant/key/skill intentionally.
- Create schema changes in `src/db/schema.ts`, run `bun run db:generate`, review
  the generated SQL in `db/migrations`, then run `bun run db:migrate`.
- If the Netlify `DATABASE_URL` is masked and direct `psql` access is not
  available, temporarily set `SKILLY_DB_SETUP_ENABLED=true`, deploy, log in as
  super admin, `POST /api/dashboard/setup-db`, verify `/api/health`, then remove
  `SKILLY_DB_SETUP_ENABLED` and redeploy.

Optional production environment variables, depending on enabled features:

- `SKILLY_DASHBOARD_ROLE`
- `POLAR_ACCESS_TOKEN`
- `POLAR_PRODUCT_ID`
- `POLAR_WEBHOOK_SECRET`
- `POLAR_PLAN_CAP_SECONDS`
- `NEXT_PUBLIC_POSTHOG_KEY`
- `NEXT_PUBLIC_POSTHOG_HOST`
- `POSTHOG_PROJECT_API_KEY`
- `POSTHOG_HOST`
- `NEXT_PUBLIC_GA_MEASUREMENT_ID`
- `GA_MEASUREMENT_ID`
- `GA_API_SECRET`

After deploy, add the final dashboard/API origin to each tenant allowlist before
using live `@skilly/web` widgets from production domains.

Custom domain DNS:

- If `tryskilly.app` stays on Namecheap nameservers, add a Namecheap DNS record:
  `CNAME studio skilly-studio.netlify.app`.
- If switching to Netlify DNS instead, set the registrar nameservers to the
  Netlify zone's NSOne nameservers and keep the Netlify-managed
  `studio.tryskilly.app -> skilly-studio.netlify.app` record.
- The current Netlify project can still be tested before DNS propagates via the
  latest deploy URL shown by `netlify deploy`.

Production smoke checks:

- `GET /api/health` returns `200` only when dashboard auth is configured and the
  Postgres tenant lookup succeeds. On failure, `checks.database.errorCode`
  reports a non-secret category such as `invalid_connection_string`,
  `connection_failed`, `auth_failed`, or `schema_missing`.
- `GET /dashboard` redirects to `/login` when unauthenticated.
- Login with WorkOS, then verify every dashboard page loads and tenant-admin
  sessions cannot access `/dashboard/admin/tenants`.
- Verify the emergency password fallback only if `SKILLY_DASHBOARD_PASSWORD` is
  intentionally configured.

## Known follow-ups

- **Usage dimensions from the SDK.** The backend stores `page`/`domain`/`duration_seconds`/`result`
  on `usage_events` and the dashboard renders them (overview recent-sessions table, usage metrics,
  top pages/domains), but `@skilly/web` does not yet send them. Until it does, Sessions / Avg session /
  Error rate / Top pages show real zeros on launch. Fix is in `sdk/web` (`realtime.ts` reporting), not here.
- **`POLAR_API_BASE` sandbox.** Polar sandbox testing needs `POLAR_API_BASE=https://api.sandbox.polar.sh`
  + sandbox tokens; the production default is `https://api.polar.sh`.
