# Production Readiness — Skilly Studio (`apps/web-backend`)

This checklist and smoke-test script verify that the Studio dashboard and web SDK control plane are ready for production traffic.

## Current State

- **Unit tests:** 69/69 passing (`bun test`)
- **Functional tests:** 14/14 passing (`bun run test:functional` against local dev server)
- **Playwright E2E:** 28/28 passing (`bun run test:e2e`) — real browser tests for auth, dashboard pages, admin, billing, usage, and web SDK API
- **Type check:** clean (`bun run typecheck`)
- **Build:** clean (`bun run build`)
- **Stack:** Next.js 15 App Router, Tailwind v4, Drizzle ORM + Postgres, Bun runtime, Netlify deploy target

## Automated Test Commands

```bash
# Unit + service tests (no DB/network needed)
bun test

# Functional end-to-end against a running local server
bun run dev          # terminal 1
bun run test:functional   # terminal 2

# Playwright E2E tests (starts dev server automatically, uses in-memory demo tenant)
bun run test:e2e

# Production smoke test against a deployed URL
bun run smoke https://studio.tryskilly.app
```

---

## 1. Pre-Deploy Checklist

### 1.1 Required Production Secrets

All of these must be set in the Netlify deploy settings (or equivalent):

- [ ] `OPENAI_API_KEY` — needed to mint Realtime client secrets
- [ ] `POSTGRES_URL` or `DATABASE_URL` — external Postgres with SSL/pooling (Neon recommended)
- [ ] `WORKOS_CLIENT_ID`
- [ ] `WORKOS_API_KEY`
- [ ] `WORKOS_DASHBOARD_REDIRECT_URI` — e.g. `https://studio.tryskilly.app/api/auth/workos/callback`
- [ ] `SKILLY_DASHBOARD_SESSION_SECRET` — strong random string for signed session cookies
- [ ] `SKILLY_DASHBOARD_PASSWORD` — optional emergency fallback password

### 1.2 Optional Secrets (feature-gated)

- [ ] Polar billing: `POLAR_ACCESS_TOKEN`, `POLAR_PRODUCT_ID`, `POLAR_WEBHOOK_SECRET`, `POLAR_PLAN_CAP_SECONDS`
- [ ] Analytics: `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST`, `NEXT_PUBLIC_GA_MEASUREMENT_ID`, etc.

### 1.3 Database

- [ ] Migrations applied (`bun run db:migrate` against production Postgres)
- [ ] Initial tenant seeded with a publishable key and allowed origins
- [ ] `dashboard_memberships` populated so WorkOS users can log in
- [ ] `usage_cap_seconds` set on the tenant (or Polar webhook configured to set it)

### 1.4 DNS / Domain

- [ ] Domain `studio.tryskilly.app` points to Netlify deploy
- [ ] WorkOS redirect URI matches the production domain exactly
- [ ] `https://studio.tryskilly.app` added to the tenant allowlist if the dashboard itself will host test widgets

### 1.5 Build Settings

- [ ] Base directory: `apps/web-backend`
- [ ] Build command: `bun run build`
- [ ] Publish directory: `.next`
- [ ] Node version: `20`
- [ ] `NETLIFY_NEXT_SKEW_PROTECTION=true`

---

## 2. Functional Smoke Tests

Run `scripts/production-smoke.ts` against the deployed URL:

```bash
cd apps/web-backend
bun run scripts/production-smoke.ts https://studio.tryskilly.app
```

It validates:

1. `/api/health` returns `200 { ok: true, service: "skilly-web-backend" }`
2. `/dashboard` redirects unauthenticated users to `/login`
3. `/api/web/token` returns `401` for missing key
4. `/api/web/token` returns `401` for invalid key format
5. `/api/web/token` returns `403` for disallowed origin (if `TEST_PUBLISHABLE_KEY` + `TEST_ALLOWED_ORIGIN` are provided)
6. `/api/web/token` can mint a real token (if `OPENAI_API_KEY` and valid test key/origin are provided)
7. `/login` and `/signup` pages load without 5xx
8. Static Next.js build artifacts are served

---

## 3. Manual Production Validation

### 3.1 Auth Flow

- [ ] Sign up creates a new tenant via `/signup`
- [ ] Login via WorkOS AuthKit succeeds and lands on `/dashboard`
- [ ] Magic Auth email flow works end-to-end
- [ ] Emergency password fallback works if configured
- [ ] Logout clears the session and redirects to `/login`

### 3.2 Dashboard Pages

- [ ] `/dashboard` overview shows readiness checks and no 5xx
- [ ] `/dashboard/install` shows the embed snippet with a real publishable key
- [ ] `/dashboard/widget` updates accent color/locale/launcher label and reflects in snippet
- [ ] `/dashboard/origins` adds/removes origins and app IDs
- [ ] `/dashboard/keys` creates and revokes publishable/secret keys (one-time reveal works)
- [ ] `/dashboard/skill` saves SKILL.md after validation, rejects injection/URLs
- [ ] `/dashboard/usage` shows usage metrics and recent sessions
- [ ] `/dashboard/billing` shows plan state and Manage/Upgrade CTA
- [ ] `/dashboard/settings` renames tenant
- [ ] `/dashboard/admin/tenants` (super admin only) lists tenants, adjusts caps, manages members

### 3.3 Widget End-to-End

- [ ] Embed snippet on a real allowed origin loads the widget
- [ ] Clicking launcher requests mic permission
- [ ] Token mint succeeds (`POST /api/web/token`)
- [ ] WebRTC connection to OpenAI Realtime succeeds
- [ ] Session usage is reported (`POST /api/web/usage`)
- [ ] Over-quota requests return `429`

### 3.4 Billing (if enabled)

- [ ] Polar checkout redirects to payment
- [ ] Polar webhook updates tenant `usage_cap_seconds` and `polar_customer_id`
- [ ] Customer portal opens for existing subscribers

---

## 4. Security & Reliability

- [ ] No secrets in source code or build output
- [ ] `SKILLY_DB_SETUP_ENABLED=false` in production (do not leave setup endpoint open)
- [ ] `SKILLY_READINESS_DEBUG=false` in production (hides DB connection details)
- [ ] Dashboard session cookie is HTTP-only and signed
- [ ] `/dashboard/admin/*` is super-admin-only
- [ ] Publishable keys are origin/app-id-locked
- [ ] Raw OpenAI API key never leaves the server
- [ ] SKILL.md safety scan rejects prompt injection and raw URLs
- [ ] Rate limiting / DDoS protection enabled at CDN/host level
- [ ] Postgres connection pooling configured for serverless

---

## 5. Monitoring & Observability

- [ ] `/api/health` is probed regularly (error codes: `invalid_connection_string`, `connection_failed`, `auth_failed`, `schema_missing`)
- [ ] PostHog events are firing (`web_sdk_token_mint_finished`, `dashboard_*`)
- [ ] Error boundary (`dashboard/error.tsx`) catches runtime errors gracefully
- [ ] Build/deploy logs reviewed for warnings

---

## 6. Known Launch Gaps

These are documented limitations, not blockers:

1. **Usage dimensions from the SDK.** The backend stores `page`/`domain`/`duration_seconds`/`result`, but `@skilly/web` does not send them yet. Sessions / Avg session / Error rate / Top pages will show real zeros until the SDK is updated.
2. **Polar sandbox.** Use `POLAR_API_BASE=https://api.sandbox.polar.sh` for pre-production billing testing.

---

## 7. Sign-Off

Before declaring production-ready, confirm:

- [ ] This checklist is complete
- [ ] `bun test` passes
- [ ] `bun run typecheck` passes
- [ ] `bun run build` passes
- [ ] Smoke tests pass against the production URL
- [ ] At least one full widget end-to-end session succeeded from a production domain
