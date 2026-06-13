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
- `GET /api/health` — liveness.
- Postgres schema in `db/schema.sql` (tenants, api_keys, tenant_skills, usage_events).

Dashboard (8.5) — Next.js + Tailwind:
- `/dashboard` — usage, allowed origins, and API-key management (create with a
  one-time reveal, revoke).
- `/dashboard/skill` — author the SKILL.md, **safety-scanned** before save
  (`domain/skillValidation.ts` — size limits + injection/exfiltration phrases +
  raw-URL check; the desktop counterpart is `SkillValidation.swift`).
- Auth: dev acts as the seeded demo tenant (`lib/session.ts`); production resolves
  the tenant from a WorkOS session (follow-up).

Billing + metering (8.6):
- `POST /api/web/usage` — the widget reports session seconds → `usage_events`
  (the quota engine already reads these).
- `POST /api/web/webhooks/polar` — Standard-Webhooks-verified subscription events
  set the tenant's `usage_cap_seconds` by plan (`domain/billing.ts`).
- `POST /api/web/checkout` — start a Polar checkout (tenant id in metadata).
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
  Postgres when `DATABASE_URL` is set, else in-memory.
- `src/tenantService.ts` — framework-free auth + mint orchestration.
- `src/app/api/**` — thin Next route handlers (CORS + extract key/origin → service).

## Develop

```bash
cd apps/web-backend
bun install
bun run test        # bun test — domain + service flow (no DB/network needed)
bun run typecheck   # tsc --noEmit (src)
bun run build       # next build
bun run dev         # next dev on :4310 (in-memory demo tenant if no DATABASE_URL)
```

Env: `OPENAI_API_KEY` (required to mint), `DATABASE_URL` (optional — in-memory
demo tenant without it). The seeded demo publishable key + allowed origins let
the local `@skilly/web` demo connect. `node_modules/`, `.next/`, `.env*` are
gitignored.

## Deploy on Netlify

Deploy this app as a separate Netlify site from the Astro marketing site. Keep it
under the same Netlify team/account, but use its own project so dashboard/API
runtime settings and secrets stay isolated from `tryskilly.app`.

Recommended Netlify settings:

- Base directory: `apps/web-backend`
- Build command: `bun run build`
- Publish directory: `.next`
- Node version: `20`
- Production domain: `dashboard.tryskilly.app` or `api.tryskilly.app`

`apps/web-backend/netlify.toml` contains the build command, publish directory,
Node version, and `NETLIFY_NEXT_SKEW_PROTECTION=true`. Netlify's Next.js support
uses the OpenNext adapter automatically, so do not pin a legacy Next plugin
unless a Netlify support issue requires it.

Required production environment variables:

- `OPENAI_API_KEY`
- `DATABASE_URL` — use an external Postgres provider with SSL/pooling suitable
  for serverless connections.

Optional production environment variables, depending on enabled features:

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
