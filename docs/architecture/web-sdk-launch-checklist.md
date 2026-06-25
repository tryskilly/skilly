# Web SDK — Launch Checklist

> Status: **Draft for review.** The code is functionally complete (Phases 8.0–8.6 on
> `main`). This is the gap between "works in dev" and "a site owner can sign up, pay,
> embed one `<script>`, and their visitors get a working companion." Companion to
> `web-sdk-prd.md`. Nothing here is new *features* — it's productionization, GTM, and
> the validations that headless tests couldn't cover.

## 0. What "launched" means (definition of done)
A real site owner, on a real domain, can:
1. Sign up (WorkOS), land in the dashboard as their own tenant (not the demo tenant).
2. Create a publishable key, author + save a SKILL.md, pick a paid plan (Polar checkout).
3. Add `<script src="https://cdn.tryskilly.app/web/v1.js" data-skilly-key="pk_live_…">`.
4. Their visitors get the companion: it talks (real OpenAI Realtime), points at real
   elements, and the session is metered against the plan.
5. We can see errors + usage, and bill correctly.

## 1. Launch gates (must pass before announcing)
- [ ] **L1 — Live OpenAI voice run (G4):** the full WebRTC↔OpenAI loop works end-to-end
      on a real page with a real `OPENAI_API_KEY` + mic. *Needs: an OpenAI key in the
      deployed backend; a human with a mic.* This is the one thing automated tests can't cover.
- [ ] **L2 — Production tenancy:** the dashboard resolves a **real WorkOS tenant**, not
      the seeded demo tenant (`lib/session.ts` stub replaced).
- [ ] **L3 — Real billing loop:** a real Polar checkout → webhook → plan cap, verified
      against the **production** Polar product + signing secret.
- [ ] **L4 — Persistent data:** backend runs on **production Postgres** (`db/schema.sql`
      applied), not the in-memory repo.
- [ ] **L5 — Hosted, versioned widget:** `@skilly/web` published + served from a CDN at a
      stable, versioned URL.
- [ ] **L6 — Privacy/compliance baseline:** consent UX + a data-processing posture for
      visitor voice + DOM content flowing to OpenAI (see §6).

## 2. Infrastructure & deployment
- [ ] Provision **production Postgres** (Neon/Supabase/RDS); apply `apps/web-backend/db/schema.sql`. *(agent can write a migration runner; provisioning needs you.)*
- [ ] Deploy `apps/web-backend` (Vercel/Fly/Railway). Set env: `OPENAI_API_KEY`, `DATABASE_URL`, `POLAR_{ACCESS_TOKEN,PRODUCT_ID,WEBHOOK_SECRET,PLAN_CAP_SECONDS}`, WorkOS creds. *(agent can write deploy config; secrets + the deploy need you.)*
- [ ] **CDN for the widget**: build `@skilly/web` (IIFE) → host at `cdn.tryskilly.app/web/v1.js` with long-cache + versioned paths (`/web/v1.js`, `/web/v1.2.3.js`). Also host the WASM core (`sdk/web/generated/*.wasm`) with correct `Content-Type: application/wasm` + CORS. *(agent can produce the build + a hosting config; DNS/CDN setup needs you.)*
- [ ] Domains + TLS: `cdn.tryskilly.app`, the backend/dashboard host, the Polar webhook URL.
- [ ] A CI job to build + publish the widget + wasm on tag (mirror `mobile-sdk-artifacts.yml`).

## 3. Auth & tenancy (retire the dev stub)
- [ ] Replace `lib/session.ts` `getCurrentTenantId()` with **WorkOS session resolution**
      (the desktop app already uses WorkOS — reuse the Worker's `/auth/*` patterns).
- [ ] **Tenant provisioning** on first sign-in: create a `tenants` row, map WorkOS user → tenant.
- [ ] Self-serve **origin allowlist** editing in the dashboard (currently seed-only) — site
      owners must add their own domains.
- [ ] Dashboard pages behind auth (currently open in dev).

## 4. Billing (productionize Polar)
- [ ] Create the **production Polar product + price(s)**; set `POLAR_PRODUCT_ID` + plan→cap mapping (today it's a single `POLAR_PLAN_CAP_SECONDS`; multi-tier needs a product→cap map).
- [ ] Register the **webhook endpoint** (`/api/web/webhooks/polar`) in Polar with the prod signing secret; confirm signature verification against a real event.
- [ ] **Customer portal** for plan management/cancellation (the desktop app already uses Polar's portal — reuse `/portal`).
- [ ] Decide + implement a **free tier / trial** (today cap 0 = no paid access; do visitors get anything pre-payment?).
- [ ] **Quota enforcement UX**: what the widget shows when a tenant is over cap (today the token mint 429s — surface a graceful message).

## 5. Distribution & developer experience
- [ ] Publish `@skilly/web` to npm (for bundler consumers) + the CDN IIFE (for `<script>`).
- [ ] **Versioning policy**: `v1.js` (auto-latest-stable) vs pinned `v1.2.3.js`; a deprecation path.
- [ ] **Install docs**: the one-script embed, the `data-skilly-*` attributes, the `data-skilly` annotation convention for robust pointing (§ PRD 8.2), the programmatic API.
- [ ] **SKILL.md authoring guide** for site owners (what makes a good teaching skill; the curriculum/vocabulary model).
- [ ] A **public demo** on a real site (the existing `demo/index.html`, hosted).

## 6. Security, privacy & compliance (some launch-blocking)
- [ ] **Consent UX** (L6): visitor voice + DOM content go to OpenAI. Site owner = data
      controller, Skilly = processor. Need a tenant-configurable consent prompt + a DPA.
- [ ] **PII redaction** in the DOM digest before it leaves the browser (emails, tokens, form values).
- [ ] **Publishable-key abuse**: confirm origin allowlist + per-tenant rate limiting on
      `/api/web/token` (the gate exists; add rate limiting + monitoring).
- [ ] **Secret hygiene**: `OPENAI_API_KEY`/`POLAR_*`/`DATABASE_URL` in a secret manager, rotation runbook.
- [ ] **Cross-origin iframes** are unreadable — document the limitation for site owners.
- [ ] Security review of the token-mint + webhook paths (auth bypass, replay, SSRF on `coreUrl`).

## 7. Observability & ops
- [ ] **Error tracking** (Sentry) on the widget + backend.
- [ ] **Usage analytics**: per-tenant sessions, minutes, errors (PostHog — the app already uses it).
- [ ] **Cost monitoring**: OpenAI Realtime spend per tenant vs. revenue (voice is expensive — watch the margin).
- [ ] **Alerts**: token-mint failure rate, webhook signature failures, quota-exceeded spikes, DB health.
- [ ] **Runbooks**: OpenAI outage, Polar webhook backlog, DB failover, key rotation.

## 8. Product / GTM (separate from engineering)
- [ ] **Pricing page** + plan definitions (tie to the Polar products).
- [ ] **Landing page** for the web product (positioning vs Intercom/Pendo/CommandBar — PRD §13).
- [ ] **Onboarding flow** for new site owners (sign up → first skill → first embed → first session).
- [ ] Beta cohort: a few friendly site owners before public launch.

## 9. Pre-launch validation (the real-world gauntlet)
- [ ] **L1 live OpenAI run** on the hosted demo with a mic — the companion actually talks + points.
- [ ] End-to-end on a **third-party-style site** (not our demo): does the DOM digest + pointing hold up on a real, messy DOM? Test the `data-skilly` annotation fallback.
- [ ] **Load/cost test**: N concurrent sessions — latency, OpenAI spend, DB load.
- [ ] **Cross-browser**: Chrome/Safari/Firefox WebRTC + mic permission flows.
- [ ] Verify metering accuracy: session seconds reported vs. actual, against the cap.

## 10. Recommended sequence
1. **Infra up** (§2: Postgres + backend deploy + CDN) → unblocks everything.
2. **L1 live OpenAI run** on the deployed backend — prove the core value works for real. *(If this fails, nothing else matters — do it first.)*
3. **Auth + tenancy** (§3) + **billing productionization** (§4) → a real owner can self-serve.
4. **Security/privacy baseline** (§6, the launch-blocking items) + **observability** (§7).
5. **Docs + demo + pricing/landing** (§5, §8).
6. **Pre-launch gauntlet** (§9) → **beta** → public.

## 11. What I (agent) can do now vs. what needs you
**Agent-doable now (no external resources):**
- WorkOS session resolution in `lib/session.ts` + tenant provisioning (against the existing repo interface).
- Per-tenant rate limiting on `/api/web/token`; PII redaction in the DOM digest; graceful over-cap UX in the widget.
- Multi-tier product→cap mapping; a free-tier/trial implementation; the `/portal` route.
- A DB migration runner; deploy config (Vercel/Fly) + a publish-on-tag CI workflow.
- Install docs, the SKILL.md authoring guide, the hosted-demo page, Sentry/PostHog wiring.

**Needs you / external resources:**
- Provisioning prod Postgres + the deploy + DNS/CDN + secrets.
- The **live OpenAI run** (a key in the deployed backend + a human with a mic).
- Production Polar product/price setup + webhook registration.
- WorkOS app config; the pricing/landing/legal (DPA) content; the beta cohort.

## 12. Open decisions
1. **Free tier / trial?** What does a visitor get before the owner pays (if anything)?
2. **Voice-only, or a text/chat tier?** Realtime voice per visitor is expensive — a cheaper text mode may be needed for unit economics (PRD §12.3).
3. **Pointing default**: auto DOM-read vs. require `data-skilly` annotations (PRD §12.1) — affects the install docs + the "it just works" promise.
4. **Hosting**: stay on Cloudflare for the CDN, or all-in on the Next.js host's edge?
5. **Multi-tier plans** now, or single plan at launch?
