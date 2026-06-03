# @skilly/web-backend

Multi-tenant control plane for the Skilly web SDK — **Next.js (App Router) +
Postgres**. Mints ephemeral OpenAI tokens for the `@skilly/web` widget, serves
tenant skills, and meters usage. This is the multi-tenant successor to the
Cloudflare Worker's `/openai/token`. See `docs/architecture/web-sdk-prd.md`.

## Status — Phases 8.4 + 8.5

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

Next: **8.6** billing + session-seconds metering (Polar). The `@skilly/web` widget
(8.3) calls `/api/web/token` to get the secret it connects to OpenAI Realtime with.

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
